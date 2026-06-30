import * as fs from "fs";
import * as path from "path";
import * as sqlite from "sqlite";
import { Database, Statement } from "sqlite3";

import { DataProvider } from "../../types/DataProvider";
import { Event } from "../../types/Event";
import { EventKindType } from "../../types/EventKind";
import { FiltersObject } from "../../types/FiltersObject";
import getEventKindType from "../../utils/getEventKindType";

let db: sqlite.Database<Database, Statement>;
const defaultQueryLimit = 1000;
const eventColumns = "id, pubkey, created_at, kind, tags, content, sig";
const aliasedEventColumns = "e.id, e.pubkey, e.created_at, e.kind, e.tags, e.content, e.sig";

interface SqlQuery {
	"sql": string;
	"params": any[];
}

interface SqlWhereClauses {
	"whereClauses": string[];
	"params": any[];
}

const provider: DataProvider = {
	"setup": async () => {
		try {
			const databasePath = getDatabasePath();
			if (databasePath !== ":memory:") {
				await fs.promises.mkdir(path.dirname(databasePath), { "recursive": true });
			}
			db = await sqlite.open({
				"filename": databasePath,
				"driver": Database
			});
			await db.run("PRAGMA foreign_keys = ON");
			await db.migrate({
				"migrationsPath": getMigrationsPath()
			});
		} catch (e) {
			console.error(e);
			throw e;
		}
	},
	"teardown": async () => {
		await db.close();
	},
	"events": {
		"get": async (id: string): Promise<Event | undefined> => {
			const event = await db.get(`SELECT ${eventColumns} FROM Event e WHERE e.id = ? AND ${activeEventWhereClause("e")} LIMIT 1`, id, getCurrentUnixTime());
			return convertFromSqlite(event);
		},
		"getAll": async (filters?: FiltersObject, options = { "limit": defaultQueryLimit }): Promise<Event[]> => {
			const events: Event[] = [];
			await provider.events.query(filters, options, (event) => {
				events.push(event);
			});
			return events;
		},
		"query": async (filters: FiltersObject | undefined, options, onEvent): Promise<number> => {
			const query = buildSubscriptionQuery(filters, options.limit);
			const handlerPromises: Promise<void>[] = [];
			let handlerError: unknown;

			const rowCount = await db.each(query.sql, ...query.params, (error: any, row: any) => {
				if (error) {
					handlerError = error;
					return;
				}
				if (handlerError) {
					return;
				}

				try {
					const event = convertFromSqlite(row);
					const handlerResult = onEvent(event);
					if (handlerResult instanceof Promise) {
						handlerPromises.push(handlerResult);
					}
				} catch (error) {
					handlerError = error;
				}
			});

			await Promise.all(handlerPromises);
			if (handlerError) {
				throw handlerError;
			}

			return rowCount;
		},
		"delete": async (id: string): Promise<void> => {
			await db.run("DELETE FROM EventTag WHERE event_id = ?", id);
			await db.run("DELETE FROM Event WHERE id = ?", id);
		},
		"deleteSupersededReplaceableEvents": async (event: Event): Promise<number> => {
			const kindType = getEventKindType(event.kind);
			if (kindType === EventKindType.replaceable) {
				const result = await db.run(`
					DELETE FROM Event
					WHERE id IN (
						SELECT old.id
						FROM Event old
						WHERE old.pubkey = ?
							AND old.kind = ?
							AND EXISTS (
								SELECT 1
								FROM Event newer
								WHERE newer.pubkey = old.pubkey
									AND newer.kind = old.kind
									AND ${activeEventWhereClause("newer")}
									AND ${newerEventWhereClause("newer", "old")}
							)
					)
				`, event.pubkey, event.kind, getCurrentUnixTime());
				return result.changes ?? 0;
			}

			if (kindType === EventKindType.parameterized_replaceable) {
				const result = await db.run(`
					DELETE FROM Event
					WHERE id IN (
						SELECT old.id
						FROM Event old
						WHERE old.pubkey = ?
							AND old.kind = ?
							AND COALESCE((${firstDTagValueSql("old")}), '') = ?
							AND EXISTS (
								SELECT 1
								FROM Event newer
								WHERE newer.pubkey = old.pubkey
									AND newer.kind = old.kind
									AND COALESCE((${firstDTagValueSql("newer")}), '') = COALESCE((${firstDTagValueSql("old")}), '')
									AND ${activeEventWhereClause("newer")}
									AND ${newerEventWhereClause("newer", "old")}
							)
					)
				`, event.pubkey, event.kind, getDTagValue(event), getCurrentUnixTime());
				return result.changes ?? 0;
			}

			return 0;
		},
		"save": async (event: Event): Promise<void> => {
			await db.exec("BEGIN IMMEDIATE TRANSACTION");
			try {
				await db.run("INSERT INTO Event (id, pubkey, created_at, kind, tags, content, sig) VALUES (?, ?, ?, ?, ?, ?, ?)", event.id, event.pubkey, event.created_at, event.kind, JSON.stringify(event.tags), event.content, event.sig);
				await saveEventTags(event);
				await db.exec("COMMIT");
			} catch (error) {
				await db.exec("ROLLBACK");
				throw error;
			}
		},
		"exists": async (id: string): Promise<boolean> => {
			const event = await db.get("SELECT 1 AS found FROM Event WHERE id = ? LIMIT 1", id);
			return Boolean(event);
		},
		"purgeExpired": async (): Promise<number> => {
			const result = await db.run(`
				DELETE FROM Event
				WHERE id IN (
					SELECT e.id
					FROM Event e
					WHERE ${expiredEventWhereClause("e")}
				)
			`, getCurrentUnixTime());
			return result.changes ?? 0;
		}
	}
}

/**
 * Builds a subscription query that is fully bounded and filterable by SQLite.
 */
function buildSubscriptionQuery(filters: FiltersObject | undefined, limit: number): SqlQuery {
	const filterClauses = buildFilterWhereClauses(filters, "e");
	const whereClauses = [
		...filterClauses.whereClauses,
		activeEventWhereClause("e"),
		latestReplaceableWhereClause("e")
	];
	const params = [
		...filterClauses.params,
		getCurrentUnixTime(),
		getCurrentUnixTime(),
		getCurrentUnixTime(),
		limit
	];

	return {
		"sql": `
			SELECT ${aliasedEventColumns}
			FROM Event e
			WHERE ${whereClauses.join(" AND ")}
			ORDER BY e.created_at DESC, e.id DESC
			LIMIT ?
		`,
		"params": params
	};
}

/**
 * Converts Nostr filter fields into SQL predicates and bound parameters.
 */
function buildFilterWhereClauses(filters: FiltersObject | undefined, eventAlias: string): SqlWhereClauses {
	const whereClauses: string[] = [];
	const params: any[] = [];

	if (!filters) {
		return { whereClauses, params };
	}

	addListFilter(whereClauses, params, `${eventAlias}.id`, filters.ids);
	addListFilter(whereClauses, params, `${eventAlias}.pubkey`, filters.authors);
	addListFilter(whereClauses, params, `${eventAlias}.kind`, filters.kinds);

	if (filters.since !== undefined) {
		whereClauses.push(`${eventAlias}.created_at >= ?`);
		params.push(filters.since);
	}
	if (filters.until !== undefined) {
		whereClauses.push(`${eventAlias}.created_at <= ?`);
		params.push(filters.until);
	}

	Object.entries(filters)
		.filter(([key]) => /^#[a-zA-Z]$/gmu.test(key))
		.forEach(([key, value], index) => {
			const tagValues = normalizeTagFilterValues(value);
			if (tagValues.length === 0) {
				whereClauses.push("0 = 1");
				return;
			}

			const tagAlias = `filterTag${index}`;
			whereClauses.push(`
				EXISTS (
					SELECT 1
					FROM EventTag ${tagAlias}
					WHERE ${tagAlias}.event_id = ${eventAlias}.id
						AND ${tagAlias}.name = ?
						AND ${tagAlias}.value IN (${placeholders(tagValues.length)})
				)
			`);
			params.push(key.slice(1), ...tagValues);
		});

	return { whereClauses, params };
}

/**
 * Adds an IN predicate while treating explicit empty arrays as no matches.
 */
function addListFilter(whereClauses: string[], params: any[], column: string, values: any[] | undefined): void {
	if (values === undefined) {
		return;
	}
	if (values.length === 0) {
		whereClauses.push("0 = 1");
		return;
	}

	whereClauses.push(`${column} IN (${placeholders(values.length)})`);
	params.push(...values);
}

/**
 * Returns a SQL predicate that excludes events with an expired expiration tag.
 */
function activeEventWhereClause(eventAlias: string): string {
	return `NOT (${expiredEventWhereClause(eventAlias)})`;
}

/**
 * Returns a SQL predicate that matches events with a numeric expiration in the past.
 */
function expiredEventWhereClause(eventAlias: string): string {
	return `
		EXISTS (
			SELECT 1
			FROM EventTag expirationTag
			WHERE expirationTag.event_id = ${eventAlias}.id
				AND expirationTag.name = 'expiration'
				AND expirationTag.value != ''
				AND expirationTag.value NOT GLOB '*[^0-9]*'
				AND CAST(expirationTag.value AS INTEGER) < ?
		)
	`;
}

/**
 * Returns a SQL predicate that keeps only the latest replaceable events.
 */
function latestReplaceableWhereClause(eventAlias: string): string {
	return `
		(
			NOT (${replaceableKindWhereClause(eventAlias)} OR ${parameterizedReplaceableKindWhereClause(eventAlias)})
			OR (
				${replaceableKindWhereClause(eventAlias)}
				AND NOT EXISTS (
					SELECT 1
					FROM Event newer
					WHERE newer.pubkey = ${eventAlias}.pubkey
						AND newer.kind = ${eventAlias}.kind
						AND ${activeEventWhereClause("newer")}
						AND ${newerEventWhereClause("newer", eventAlias)}
				)
			)
			OR (
				${parameterizedReplaceableKindWhereClause(eventAlias)}
				AND NOT EXISTS (
					SELECT 1
					FROM Event newer
					WHERE newer.pubkey = ${eventAlias}.pubkey
						AND newer.kind = ${eventAlias}.kind
						AND COALESCE((${firstDTagValueSql("newer")}), '') = COALESCE((${firstDTagValueSql(eventAlias)}), '')
						AND ${activeEventWhereClause("newer")}
						AND ${newerEventWhereClause("newer", eventAlias)}
				)
			)
		)
	`;
}

/**
 * Returns true in SQL when a row is newer than another row.
 */
function newerEventWhereClause(newerAlias: string, olderAlias: string): string {
	return `(${newerAlias}.created_at > ${olderAlias}.created_at OR (${newerAlias}.created_at = ${olderAlias}.created_at AND ${newerAlias}.id > ${olderAlias}.id))`;
}

/**
 * Returns the SQL expression for replaceable event kinds.
 */
function replaceableKindWhereClause(eventAlias: string): string {
	return `(${eventAlias}.kind = 0 OR (${eventAlias}.kind >= 10000 AND ${eventAlias}.kind < 20000))`;
}

/**
 * Returns the SQL expression for parameterized replaceable event kinds.
 */
function parameterizedReplaceableKindWhereClause(eventAlias: string): string {
	return `(${eventAlias}.kind >= 30000 AND ${eventAlias}.kind < 40000)`;
}

/**
 * Returns a scalar subquery for the first d tag on an event.
 */
function firstDTagValueSql(eventAlias: string): string {
	return `SELECT dTag.value FROM EventTag dTag WHERE dTag.event_id = ${eventAlias}.id AND dTag.name = 'd' ORDER BY dTag.position LIMIT 1`;
}

/**
 * Saves queryable tag rows for an event inside the caller's transaction.
 */
async function saveEventTags(event: Event): Promise<void> {
	if (event.tags.length === 0) {
		return;
	}

	const insertTagStatement = await db.prepare("INSERT INTO EventTag (event_id, name, value, position) VALUES (?, ?, ?, ?)");
	try {
		for (const [position, tag] of event.tags.entries()) {
			const tagName = tag[0];
			const tagValue = tag[1];
			if (typeof tagName !== "string" || typeof tagValue !== "string") {
				continue;
			}

			await insertTagStatement.run(event.id, tagName, tagValue, position);
		}
	} finally {
		await insertTagStatement.finalize();
	}
}

/**
 * Normalizes a tag filter into an array of values.
 */
function normalizeTagFilterValues(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((tagValue) => typeof tagValue === "string");
	}
	if (typeof value === "string") {
		return [value];
	}

	return [];
}

/**
 * Returns the first d tag value used by parameterized replaceable events.
 */
function getDTagValue(event: Event): string {
	return event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
}

/**
 * Returns the current Unix timestamp in seconds for expiration comparisons.
 */
function getCurrentUnixTime(): number {
	return Math.floor(Date.now() / 1000);
}

/**
 * Builds a comma-separated placeholder list for bound parameters.
 */
function placeholders(count: number): string {
	return new Array(count).fill("?").join(", ");
}

/**
 * Locates the project root from either source or compiled output paths.
 */
function getProjectRoot(): string {
	const candidates = [
		path.join(__dirname, "../../../../"),
		path.join(__dirname, "../../../")
	];
	const projectRoot = candidates.find((candidate) => fs.existsSync(path.join(candidate, "resources/data_providers/sqlite/migrations")));
	if (!projectRoot) {
		return path.join(__dirname, "../../../../");
	}

	return projectRoot;
}

/**
 * Returns the configured SQLite database path.
 */
function getDatabasePath(): string {
	return process.env.NOSTR_RELAY_SQLITE_PATH ?? path.join(getProjectRoot(), "data.db");
}

/**
 * Returns the migration directory for the active runtime path.
 */
function getMigrationsPath(): string {
	return path.join(getProjectRoot(), "resources/data_providers/sqlite/migrations");
}

function convertFromSqlite(event: any): Event {
	if (!event) {
		return event;
	}

	const convertedEvent: Event = {
		...event,
		"tags": JSON.parse(event.tags)
	};
	return convertedEvent;
}

export default provider;
