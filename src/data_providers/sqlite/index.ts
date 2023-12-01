import * as path from "path";
import * as sqlite from "sqlite";
import { Database, Statement } from "sqlite3";

import { DataProvider } from "../../types/DataProvider";
import { Event } from "../../types/Event";
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
		"getAll": async (): Promise<Event[]> => {
			const events: Event[] = (await db.all("SELECT * FROM Event")).map((event) => convertFromSqlite(event));
			return events.filter((event) => isEventExpired(event) === false);
		},
		"delete": async (id: string): Promise<void> => {
			await db.run("DELETE FROM Event WHERE id = ?", id);
		},
		"save": async (event: Event): Promise<void> => {
			await db.run("INSERT INTO Event (id, pubkey, created_at, kind, tags, content, sig) VALUES (?, ?, ?, ?, ?, ?, ?)", event.id, event.pubkey, event.created_at, event.kind, JSON.stringify(event.tags), event.content, event.sig);
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
