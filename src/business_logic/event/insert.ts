import { Event } from "../../types/Event";
import { Configuration } from "../../types/Configuration";
import { WebSocket } from "ws";
import { verifyNostrSignature } from "../../utils/verifySignature";
import { DataProvider } from "../../types/DataProvider";

export default async function (configuration: Configuration, ws: WebSocket, dataProvider: DataProvider, message: Event, sendEventToSubscribers: ((event: Event) => void)): Promise<void> {
	if (configuration.allowedPublicKeys && configuration.allowedPublicKeys.includes(message.pubkey)) {
		if (verifyNostrSignature(message)) {
			await dataProvider.events.save(message);
			sendEventToSubscribers(message);
			ws.send(JSON.stringify(["OK", message.id, true, ""]));
			console.log(`Received message`, message);
			return;
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
