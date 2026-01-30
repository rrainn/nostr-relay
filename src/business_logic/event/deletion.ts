import { Event } from "../../types/Event";
import { Configuration } from "../../types/Configuration";
import { WebSocket } from "ws";
import { DataProvider } from "../../types/DataProvider";
import { verifyNostrSignature } from "../../utils/verifySignature";
import { EventKind } from "../../types/EventKind";
import insertEvent from "./insert";

export default async function (configuration: Configuration, ws: WebSocket, dataProvider: DataProvider, message: Event, sendEventToSubscribers: ((event: Event) => void)): Promise<void> {
	if (configuration.allowedPublicKeys && configuration.allowedPublicKeys.includes(message.pubkey)) {
		if (verifyNostrSignature(message)) {
			const usersEvents: Event[] = (await dataProvider.events.getAll({ authors: [message.pubkey] })).filter((event) => event.pubkey === message.pubkey);

			const invalidDeleteIDs = message.tags.some((tag) => tag[0] !== "e" || usersEvents.some((event) => event.id === tag[1] && event.kind !== EventKind.TEXT));
			if (invalidDeleteIDs) {
				console.warn(`Received message with invalid delete IDs`, message);
			}

			await insertEvent(configuration, ws, dataProvider, message, sendEventToSubscribers);

			const deleteIDsToDelete = message.tags.filter((tag) => tag[0] === "e").map((tag) => tag[1]).filter((id) => usersEvents.some((event) => event.id === id));
			deleteIDsToDelete.forEach((id) => {
				dataProvider.events.delete(id);
			});
		} else {
			ws.send(JSON.stringify(["OK", message.id, false, "error: invalid signature"]));
			console.log(`Received message with invalid signature`, message);
			return;
		}
	} else {
		ws.send(JSON.stringify(["OK", message.id, false, "blocked: this is currently a private relay"]));
		console.log(`Received message from unauthorized public key`, message);
		return
	}
}
