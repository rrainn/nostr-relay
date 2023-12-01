import { DataProvider } from "../types/DataProvider";
import { Event } from "../types/Event";
import isEventExpired from "../utils/isEventExpired";

let events: Event[] = [];
let allowedPublicKeys: string[] = [];

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
		"getAll": async (): Promise<Event[]> => {
			return events.filter((event) => isEventExpired(event) === false);
		},
		"delete": async (id: string): Promise<void> => {
			events = events.filter((event) => event.id !== id);
		},
		"save": async (event: Event): Promise<void> => {
			events.push(event);
		},
		"purgeExpired": async (): Promise<void> => {
			events = events.filter((event) => isEventExpired(event) === false);
		}
	}
}

export default provider;
