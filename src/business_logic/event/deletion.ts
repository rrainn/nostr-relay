import { Event } from "../../types/Event";
import { Configuration } from "../../types/Configuration";
import { WebSocket } from "ws";
import { DataProvider } from "../../types/DataProvider";
import { verifyNostrSignature } from "../../utils/verifySignature";
import { EventKind } from "../../types/EventKind";
import insertEvent from "./insert";

/**
 * Handles NIP-09 deletion events without loading an author's full event history.
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

	const deleteIDs = message.tags
		.filter((tag) => tag[0] === "e" && typeof tag[1] === "string")
		.map((tag) => tag[1]);
	const usersTextEvents: Event[] = await dataProvider.events.getAll({
		"ids": deleteIDs,
		"authors": [message.pubkey],
		"kinds": [EventKind.TEXT]
	}, { "limit": Math.max(deleteIDs.length, 1) });
	const deleteIDsToDelete = usersTextEvents.map((event) => event.id);
	const invalidDeleteIDs = message.tags.some((tag) => tag[0] !== "e") || deleteIDs.length !== deleteIDsToDelete.length;
	if (invalidDeleteIDs) {
		console.warn("Received message with invalid delete IDs", {
			...eventMetadata,
			"requestedDeleteCount": deleteIDs.length,
			"matchedDeleteCount": deleteIDsToDelete.length
		});
	}

	await insertEvent(configuration, ws, dataProvider, message, sendEventToSubscribers);

	for (const id of deleteIDsToDelete) {
		await dataProvider.events.delete(id);
	}
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
