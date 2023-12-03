import { Event } from "./Event";

export interface DataProvider {
	"setup": () => Promise<void>;

	"events": {
		"get": (id: string) => Promise<Event | undefined>;
		"getAll": () => Promise<Event[]>;
		"delete": (id: string) => Promise<void>;
		"save": (event: Event) => Promise<void>;
		"exists": (id: string) => Promise<boolean>;
		"purgeExpired": () => Promise<void>;
	}
}
