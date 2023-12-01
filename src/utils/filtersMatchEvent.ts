import { FiltersObject } from "../types/FiltersObject";
import { Event } from "../types/Event";

/**
 * Returns true if the event matches any of the filters.
 */
export function filtersMatchEvent(filters: FiltersObject, event: Event): boolean {
	if (Object.keys(filters).length === 0) {
		return true;
	}

	const idFilterPass = filters.ids && filters.ids.includes(event.id);
	const authorFilterPass = filters.authors && filters.authors.includes(event.pubkey);
	const kindFilterPass = filters.kinds && filters.kinds.includes(event.kind);
	const sinceFilterPass = filters.since && filters.since <= event.created_at;
	const untilFilterPass = filters.until && filters.until >= event.created_at;

	return Boolean(idFilterPass || authorFilterPass || kindFilterPass || sinceFilterPass || untilFilterPass);

	// @TODO: implement "#<single-letter (a-zA-Z)>"
}
