import { Event } from "./Event";
import { FiltersObject } from "./FiltersObject";

export interface EventQueryOptions {
	/**
	 * The maximum number of events storage may return for this query.
	 */
	"limit": number;
}

export type EventQueryHandler = (event: Event) => Promise<void> | void;

export interface DataProvider {
	"setup": () => Promise<void>;
	"teardown"?: () => Promise<void>;

	"events": {
		"get": (id: string) => Promise<Event | undefined>;
		"getAll": (filters?: FiltersObject, options?: EventQueryOptions) => Promise<Event[]>;
		"query": (filters: FiltersObject | undefined, options: EventQueryOptions, onEvent: EventQueryHandler) => Promise<number>;
		"delete": (id: string) => Promise<void>;
		"deleteSupersededReplaceableEvents": (event: Event) => Promise<number>;
		"save": (event: Event) => Promise<void>;
		"exists": (id: string) => Promise<boolean>;
		"purgeExpired": () => Promise<number>;
	}
}
