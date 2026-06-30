import { DataProvider } from "../types/DataProvider";
import { Event } from "../types/Event";
import { EventKindType } from "../types/EventKind";
import { FiltersObject } from "../types/FiltersObject";
import { filtersMatchEvent } from "../utils/filtersMatchEvent";
import getEventKindType from "../utils/getEventKindType";
import isEventExpired from "../utils/isEventExpired";

let events: Event[] = [];
const defaultQueryLimit = 1000;

const provider: DataProvider = {
	"setup": async () => {},
	"events": {
		"get": async (id: string): Promise<Event | undefined> => {
			const event: Event | undefined = events.find((event) => event.id === id);
			if (event && isEventExpired(event) === false) {
				return event;
			}
			return undefined;
		},
		"getAll": async (filters?: FiltersObject, options = { "limit": defaultQueryLimit }): Promise<Event[]> => {
			return getBoundedEvents(events, filters, options.limit);
		},
		"query": async (filters: FiltersObject | undefined, options, onEvent): Promise<number> => {
			const matchedEvents = getBoundedEvents(events, filters, options.limit);
			for (const event of matchedEvents) {
				await onEvent(event);
			}

			return matchedEvents.length;
		},
		"delete": async (id: string): Promise<void> => {
			events = events.filter((event) => event.id !== id);
		},
		"deleteSupersededReplaceableEvents": async (event: Event): Promise<number> => {
			const initialCount = events.length;
			events = events.filter((storedEvent) => shouldKeepReplaceableEvent(storedEvent, event));
			return initialCount - events.length;
		},
		"save": async (event: Event): Promise<void> => {
			events.push(event);
		},
		"exists": async (id: string): Promise<boolean> => {
			return events.some((event) => event.id === id);
		},
		"purgeExpired": async (): Promise<number> => {
			const initialCount = events.length;
			events = events.filter((event) => isEventExpired(event) === false);
			return initialCount - events.length;
		}
	}
}

/**
 * Applies relay query behavior to the already in-memory event list.
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
function shouldKeepReplaceableEvent(storedEvent: Event, changedEvent: Event): boolean {
	if (!isSameReplaceableKey(storedEvent, changedEvent)) {
		return true;
	}

	return !events.some((candidateEvent) => isNewerReplaceableEvent(candidateEvent, storedEvent));
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

export default provider;
