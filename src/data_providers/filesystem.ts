import * as path from "path";
import * as fs from "fs";

import { DataProvider } from "../types/DataProvider";
import { Event } from "../types/Event";
import { EventKindType } from "../types/EventKind";
import { FiltersObject } from "../types/FiltersObject";
import { filtersMatchEvent } from "../utils/filtersMatchEvent";
import getEventKindType from "../utils/getEventKindType";
import isEventExpired from "../utils/isEventExpired";

const dataDirectory = path.join(__dirname, "../../../data");
const defaultQueryLimit = 1000;

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
		"getAll": async (filters?: FiltersObject, options = { "limit": defaultQueryLimit }): Promise<Event[]> => {
			return getBoundedEvents(await readStoredEvents(), filters, options.limit);
		},
		"query": async (filters: FiltersObject | undefined, options, onEvent): Promise<number> => {
			const matchedEvents = getBoundedEvents(await readStoredEvents(), filters, options.limit);
			for (const event of matchedEvents) {
				await onEvent(event);
			}

			return matchedEvents.length;
		},
		"delete": async (id: string): Promise<void> => {
			const eventPath = path.join(dataDirectory, "events", `${id}.json`);
			await fs.promises.unlink(eventPath);
		},
		"deleteSupersededReplaceableEvents": async (event: Event): Promise<number> => {
			const storedEvents = await readStoredEvents();
			const eventsToDelete = storedEvents.filter((storedEvent) => {
				return !shouldKeepReplaceableEvent(storedEvents, storedEvent, event);
			});

			for (const eventToDelete of eventsToDelete) {
				await provider.events.delete(eventToDelete.id);
			}

			return eventsToDelete.length;
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
		"purgeExpired": async (): Promise<number> => {
			let deletedEvents = 0;
			const eventDirectory = path.join(dataDirectory, "events");
			const eventFiles = await fs.promises.readdir(eventDirectory);
			for (const eventFile of eventFiles) {
				const eventPath = path.join(eventDirectory, eventFile);
				const event: Event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
				if (isEventExpired(event)) {
					await fs.promises.unlink(eventPath);
					deletedEvents++;
				}
			}
			return deletedEvents;
		}
	}
}

export default provider;

/**
 * Reads all file-backed events for maintenance operations.
 */
async function readStoredEvents(): Promise<Event[]> {
	const events: Event[] = [];
	const eventDirectory = path.join(dataDirectory, "events");
	const eventFiles = await fs.promises.readdir(eventDirectory);
	for (const eventFile of eventFiles) {
		const eventPath = path.join(eventDirectory, eventFile);
		events.push(JSON.parse(fs.readFileSync(eventPath, "utf8")));
	}

	return events;
}

/**
 * Applies relay query behavior to the file-backed event list.
 */
function getBoundedEvents(sourceEvents: Event[], filters: FiltersObject | undefined, limit: number): Event[] {
	const matchedEvents = sourceEvents
		.filter((event) => isEventExpired(event) === false)
		.filter((event) => filtersMatchEvent(filters as FiltersObject, event))
		.sort(sortNewestFirst);
	return removeSupersededReplaceableEvents(matchedEvents).slice(0, limit);
}

/**
 * Keeps only the latest replaceable event for each replaceable key.
 */
function removeSupersededReplaceableEvents(sourceEvents: Event[]): Event[] {
	return sourceEvents.filter((event) => {
		return !sourceEvents.some((candidateEvent) => isNewerReplaceableEvent(candidateEvent, event));
	});
}

/**
 * Returns true when the stored event should survive cleanup after a replaceable write.
 */
function shouldKeepReplaceableEvent(sourceEvents: Event[], storedEvent: Event, changedEvent: Event): boolean {
	if (!isSameReplaceableKey(storedEvent, changedEvent)) {
		return true;
	}

	return !sourceEvents.some((candidateEvent) => isNewerReplaceableEvent(candidateEvent, storedEvent));
}

/**
 * Returns true when candidateEvent supersedes currentEvent for the same replaceable key.
 */
function isNewerReplaceableEvent(candidateEvent: Event, currentEvent: Event): boolean {
	return isSameReplaceableKey(candidateEvent, currentEvent) && sortNewestFirst(candidateEvent, currentEvent) < 0;
}

/**
 * Returns true when two events share a replaceable storage key.
 */
function isSameReplaceableKey(firstEvent: Event, secondEvent: Event): boolean {
	const firstKindType = getEventKindType(firstEvent.kind);
	if (firstKindType !== getEventKindType(secondEvent.kind)) {
		return false;
	}
	if (firstEvent.pubkey !== secondEvent.pubkey || firstEvent.kind !== secondEvent.kind) {
		return false;
	}
	if (firstKindType === EventKindType.replaceable) {
		return true;
	}
	if (firstKindType === EventKindType.parameterized_replaceable) {
		return getDTagValue(firstEvent) === getDTagValue(secondEvent);
	}

	return false;
}

/**
 * Sorts events in the same order used by SQLite subscription queries.
 */
function sortNewestFirst(firstEvent: Event, secondEvent: Event): number {
	if (firstEvent.created_at !== secondEvent.created_at) {
		return secondEvent.created_at - firstEvent.created_at;
	}

	return secondEvent.id.localeCompare(firstEvent.id);
}

/**
 * Returns the first `d` tag value used by parameterized replaceable events.
 */
function getDTagValue(event: Event): string {
	return event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
}

async function createDirectoryIfNotExists(dir: string): Promise<void> {
	if (!fs.existsSync(dir)) {
		await fs.promises.mkdir(dir, { "recursive": true });
	}
}
