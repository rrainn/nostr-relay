import { Event } from "../types/Event";

export default (event: Event): boolean => {
	const now = Date.now() / 1000;
	const expirationString = event.tags.find((tag) => tag[0] === "expiration")?.[1];
	const expiration = expirationString ? parseInt(expirationString) : undefined;
	if (expiration) {
		return now > expiration;
	} else {
		return false;
	}
};
