import { FiltersObject } from "../types/FiltersObject";
import { Event } from "../types/Event";

/**
 * Returns true if the event matches the filters.
 */
export function filtersMatchEvent(filters: FiltersObject, event: Event): boolean {
	if (!filters || Object.keys(filters).length === 0) {
		return true;
	}

	const idFilterPass = !filters.ids || filters.ids.includes(event.id);
	const authorFilterPass = !filters.authors || filters.authors.includes(event.pubkey);
	const kindFilterPass = !filters.kinds || filters.kinds.includes(event.kind);
	const sinceFilterPass = !filters.since || filters.since <= event.created_at;
	const untilFilterPass = !filters.until || filters.until >= event.created_at;

	const tagsMatch = Object.entries(filters).filter(([key]) => /^#[a-zA-Z]$/gmu.test(key)).every(([key, value]) => {
		const tag = key.slice(1);
		const eventTagsThatMatchKey = event.tags.filter((eventTag) => eventTag[0] === tag);

		return eventTagsThatMatchKey.some((eventTag) => eventTag[1] === value);
	});

	return Boolean(idFilterPass && authorFilterPass && kindFilterPass && sinceFilterPass && untilFilterPass && tagsMatch);
}
