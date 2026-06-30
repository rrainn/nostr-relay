import { FiltersObject } from "../types/FiltersObject";
import { Event } from "../types/Event";

/**
 * Returns true if the event matches the filters.
 */
export function filtersMatchEvent(filters: FiltersObject, event: Event): boolean {
	if (!filters || Object.keys(filters).length === 0) {
		return true;
	}

	const idFilterPass = !filters.ids || (filters.ids.length > 0 && filters.ids.includes(event.id));
	const authorFilterPass = !filters.authors || (filters.authors.length > 0 && filters.authors.includes(event.pubkey));
	const kindFilterPass = !filters.kinds || (filters.kinds.length > 0 && filters.kinds.includes(event.kind));
	const sinceFilterPass = !filters.since || filters.since <= event.created_at;
	const untilFilterPass = !filters.until || filters.until >= event.created_at;

	const tagsMatch = Object.entries(filters).filter(([key]) => /^#[a-zA-Z]$/gmu.test(key)).every(([key, value]) => {
		const tagValues = Array.isArray(value) ? value : [value];
		const tag = key.slice(1);
		const eventTagsThatMatchKey = event.tags.filter((eventTag) => eventTag[0] === tag);

		return tagValues.length > 0 && eventTagsThatMatchKey.some((eventTag) => tagValues.includes(eventTag[1]));
	});

	return Boolean(idFilterPass && authorFilterPass && kindFilterPass && sinceFilterPass && untilFilterPass && tagsMatch);
}
