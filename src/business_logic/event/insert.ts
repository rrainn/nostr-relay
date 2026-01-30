import { Event } from "../../types/Event";
import { Configuration } from "../../types/Configuration";
import { WebSocket } from "ws";
import { verifyNostrSignature } from "../../utils/verifySignature";
import { DataProvider } from "../../types/DataProvider";
import getEventKindType from "../../utils/getEventKindType";
import { EventKindType } from "../../types/EventKind";

export default async function (configuration: Configuration, ws: WebSocket, dataProvider: DataProvider, message: Event, sendEventToSubscribers: ((event: Event) => void)): Promise<void> {
	if (configuration.allowedPublicKeys && configuration.allowedPublicKeys.includes(message.pubkey)) {
		if (verifyNostrSignature(message)) {
			if (await dataProvider.events.exists(message.id)) {
				ws.send(JSON.stringify(["OK", message.id, false, "duplicate: event with this id already exists"]));
				console.warn(`Received message with duplicate id`, message);
				return;
			} else {
				await dataProvider.events.save(message);
				sendEventToSubscribers(message);
				ws.send(JSON.stringify(["OK", message.id, true, ""]));
				console.log(`Received message`, message);

				if (configuration.alwaysStoreReplaceableEvents !== true) {
					if (getEventKindType(message.kind) === EventKindType.replaceable) {
						const eventsToDelete = (await dataProvider.events.getAll({ kinds: [message.kind], authors: [message.pubkey] })).filter((event: Event) => message.kind === event.kind && message.pubkey === event.pubkey);
						for (const event of eventsToDelete) {
							await dataProvider.events.delete(event.id);
						}
					}
				}
				return;
			}
		} else {
			ws.send(JSON.stringify(["OK", message.id, false, "error: invalid signature"]));
			console.log(`Received message with invalid signature`, message);
			return;
		}
	} else {
		ws.send(JSON.stringify(["OK", message.id, false, "blocked: this is currently a private relay"]));
		console.log(`Received message from unauthorized public key`, message);
		return;
	}
}
