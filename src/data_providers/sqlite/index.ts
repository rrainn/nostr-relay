import * as path from "path";
import sqlite from "sqlite";
import { Database, Statement } from "sqlite3";

import { DataProvider } from "../../types/DataProvider";
import { Event } from "../../types/Event";
import isEventExpired from "../../utils/isEventExpired";

let db: sqlite.Database<Database, Statement>;

const provider: DataProvider = {
	"setup": async () => {
		db = await sqlite.open({
			"filename": path.join(__dirname, "../../../data.db"),
			"driver": sqlite.Database
		});
		await db.migrate({
			"migrationsPath": path.join(__dirname, "./migrations")
		});
	},
	"events": {
		"get": async (id: string): Promise<Event | undefined> => {
			const event: Event | undefined = await db.get("SELECT * FROM Event WHERE id = ?", id);
			if (event && isEventExpired(event) === false) {
				return event;
			}
			return undefined;
		},
		"getAll": async (): Promise<Event[]> => {
			const events: Event[] = await db.all("SELECT * FROM Event");
			return events.filter((event) => isEventExpired(event) === false);
		},
		"delete": async (id: string): Promise<void> => {
			await db.run("DELETE FROM Event WHERE id = ?", id);
		},
		"save": async (event: Event): Promise<void> => {
			await db.run("INSERT INTO Event (id, pubkey, created_at, kind, tags, content, sig) VALUES (?, ?, ?, ?, ?, ?, ?)", event.id, event.pubkey, event.created_at, event.kind, event.tags, event.content, event.sig);
		},
		"purgeExpired": async (): Promise<void> => {
			const events: Event[] = await db.all("SELECT * FROM Event");
			const expiredEvents: Event[] = events.filter((event) => isEventExpired(event));
			await Promise.all(expiredEvents.map((event) => db.run("DELETE FROM Event WHERE id = ?", event.id)));
		}
	}
}

export default provider;
