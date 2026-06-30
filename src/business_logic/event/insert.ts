import { Event } from "../../types/Event";
import { Configuration } from "../../types/Configuration";
import { WebSocket } from "ws";
import { verifyNostrSignature } from "../../utils/verifySignature";
import { DataProvider } from "../../types/DataProvider";

/**
 * Validates, stores, and broadcasts an incoming event.
 */
export default async function (configuration: Configuration, ws: WebSocket, dataProvider: DataProvider, message: Event, sendEventToSubscribers: ((event: Event) => void)): Promise<void> {
	const eventMetadata = getEventLogMetadata(message);

	if (configuration.allowedPublicKeys && !configuration.allowedPublicKeys.includes(message.pubkey)) {
		ws.send(JSON.stringify(["OK", message.id, false, "blocked: this is currently a private relay"]));
		console.log("Received message from unauthorized public key", eventMetadata);
		return;
	}

	if (!verifyNostrSignature(message)) {
		ws.send(JSON.stringify(["OK", message.id, false, "error: invalid signature"]));
		console.log("Received message with invalid signature", eventMetadata);
		return;
	}

	if (await dataProvider.events.exists(message.id)) {
		ws.send(JSON.stringify(["OK", message.id, false, "duplicate: event with this id already exists"]));
		console.warn("Received message with duplicate id", eventMetadata);
		return;
	}

	await dataProvider.events.save(message);
	let deletedSupersededEvents = 0;
	if (configuration.alwaysStoreReplaceableEvents !== true) {
		deletedSupersededEvents = await dataProvider.events.deleteSupersededReplaceableEvents(message);
	}

	if (await dataProvider.events.exists(message.id)) {
		sendEventToSubscribers(message);
	}
	ws.send(JSON.stringify(["OK", message.id, true, ""]));
	console.log("Received message", {
		...eventMetadata,
		"deletedSupersededEvents": deletedSupersededEvents
	});
}

/**
 * Builds log-safe event metadata without serializing the full event body.
 */
function getEventLogMetadata(event: Event): Record<string, string | number> {
	return {
		"id": event.id,
		"kind": event.kind,
		"pubkey": event.pubkey,
		"created_at": event.created_at,
		"tagCount": event.tags.length
	};
}
