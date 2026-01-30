import * as path from "path";
import * as sqlite from "sqlite";
import { Database, Statement } from "sqlite3";

import { DataProvider } from "../../types/DataProvider";
import { Event } from "../../types/Event";
import { FiltersObject } from "../../types/FiltersObject";
import { filtersMatchEvent } from "../../utils/filtersMatchEvent";
import isEventExpired from "../../utils/isEventExpired";

let db: sqlite.Database<Database, Statement>;

const provider: DataProvider = {
	"setup": async () => {
		try {
			db = await sqlite.open({
				"filename": path.join(__dirname, "../../../../data.db"),
				"driver": Database
			});
			await db.migrate({
				"migrationsPath": path.join(__dirname, "../../../../resources/data_providers/sqlite/migrations")
			});
		} catch (e) {
			console.error(e);
			throw e;
		}
	},
	"events": {
		"get": async (id: string): Promise<Event | undefined> => {
			const event: Event | undefined = convertFromSqlite(await db.get("SELECT * FROM Event WHERE id = ?", id));
			if (event && isEventExpired(event) === false) {
				return event;
			}
			return undefined;
		},
		"getAll": async (filters?: FiltersObject): Promise<Event[]> => {
			const whereClauses: string[] = [];
			const params: any[] = [];

			if (filters) {
				if (filters.ids && filters.ids.length > 0) {
					whereClauses.push(`id IN (${filters.ids.map(() => "?").join(", ")})`);
					params.push(...filters.ids);
				}
				if (filters.authors && filters.authors.length > 0) {
					whereClauses.push(`pubkey IN (${filters.authors.map(() => "?").join(", ")})`);
					params.push(...filters.authors);
				}
				if (filters.kinds && filters.kinds.length > 0) {
					whereClauses.push(`kind IN (${filters.kinds.map(() => "?").join(", ")})`);
					params.push(...filters.kinds);
				}
				if (filters.since !== undefined) {
					whereClauses.push(`created_at >= ?`);
					params.push(filters.since);
				}
				if (filters.until !== undefined) {
					whereClauses.push(`created_at <= ?`);
					params.push(filters.until);
				}
			}

			let sql = "SELECT * FROM Event";
			if (whereClauses.length > 0) {
				sql += " WHERE " + whereClauses.join(" AND ");
			}

			let events: Event[] = (await db.all(sql, ...params)).map((event) => convertFromSqlite(event));
			events = events.filter((event) => isEventExpired(event) === false);

			// Apply tag filters in-memory (tags are stored as JSON)
			if (filters) {
				events = events.filter((event) => filtersMatchEvent(filters, event));
			}

			return events;
		},
		"delete": async (id: string): Promise<void> => {
			await db.run("DELETE FROM Event WHERE id = ?", id);
		},
		"save": async (event: Event): Promise<void> => {
			await db.run("INSERT INTO Event (id, pubkey, created_at, kind, tags, content, sig) VALUES (?, ?, ?, ?, ?, ?, ?)", event.id, event.pubkey, event.created_at, event.kind, JSON.stringify(event.tags), event.content, event.sig);
		},
		"exists": async (id: string): Promise<boolean> => {
			const count = await db.get("SELECT COUNT(*) AS count FROM Event WHERE id = ?", id);
			// I'm unsure if this `parseInt` is necessary, but I'm doing it just in case.
			return parseInt(count.count) > 0;
		},
		"purgeExpired": async (): Promise<void> => {
			const events: Event[] = (await db.all("SELECT * FROM Event")).map((event) => convertFromSqlite(event));
			const expiredEvents: Event[] = events.filter((event) => isEventExpired(event));
			console.log(`Purging ${expiredEvents.length} expired events`);
			await Promise.all(expiredEvents.map((event) => db.run("DELETE FROM Event WHERE id = ?", event.id)));
		}
	}
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
