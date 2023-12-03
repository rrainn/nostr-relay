import * as path from "path";
import * as fs from "fs";

import { DataProvider } from "../types/DataProvider";
import { Event } from "../types/Event";
import isEventExpired from "../utils/isEventExpired";

const dataDirectory = path.join(__dirname, "../../../data");

const provider: DataProvider = {
	"setup": async () => {
		await createDirectoryIfNotExists(dataDirectory);
		await createDirectoryIfNotExists(path.join(dataDirectory, "events"));
	},
	"events": {
		"get": async (id: string): Promise<Event | undefined> => {
			const eventPath = path.join(dataDirectory, "events", `${id}.json`);
			if (fs.existsSync(eventPath)) {
				const event: Event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
				if (!isEventExpired(event)) {
					return event;
				}
			}
			return undefined;
		},
		"getAll": async (): Promise<Event[]> => {
			const events: Event[] = [];
			const eventDirectory = path.join(dataDirectory, "events");
			const eventFiles = await fs.promises.readdir(eventDirectory);
			for (const eventFile of eventFiles) {
				const eventPath = path.join(eventDirectory, eventFile);
				events.push(JSON.parse(fs.readFileSync(eventPath, "utf8")));
			}
			return events.filter((event) => isEventExpired(event) === false);
		},
		"delete": async (id: string): Promise<void> => {
			const eventPath = path.join(dataDirectory, "events", `${id}.json`);
			await fs.promises.unlink(eventPath);
		},
		"save": async (event: Event): Promise<void> => {
			// @TODO: check to see if event already exists
			const eventPath = path.join(dataDirectory, "events", `${event.id}.json`);
			await fs.promises.writeFile(eventPath, JSON.stringify(event, null, "\t"));
		},
		"exists": async (id: string): Promise<boolean> => {
			const eventPath = path.join(dataDirectory, "events", `${id}.json`);
			return fs.existsSync(eventPath);
		},
		"purgeExpired": async (): Promise<void> => {
			const now = Date.now() / 1000;
			const eventDirectory = path.join(dataDirectory, "events");
			const eventFiles = await fs.promises.readdir(eventDirectory);
			for (const eventFile of eventFiles) {
				const eventPath = path.join(eventDirectory, eventFile);
				const event: Event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
				if (isEventExpired(event)) {
					await fs.promises.unlink(eventPath);
				}
			}
		}
	}
}

export default provider;


async function createDirectoryIfNotExists(dir: string): Promise<void> {
	if (!fs.existsSync(dir)) {
		await fs.promises.mkdir(dir, { "recursive": true });
	}
}
