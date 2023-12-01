import { Event } from "../../types/Event";
import { Configuration } from "../../types/Configuration";
import { WebSocket } from "ws";
import { verifyNostrSignature } from "../../utils/verifySignature";
import { DataProvider } from "../../types/DataProvider";
import { durationToString } from "../../utils/durationToString";
import insertEvent from "./insert";

export default async function (configuration: Configuration, ws: WebSocket, dataProvider: DataProvider, message: Event, sendEventToSubscribers: ((event: Event) => void)): Promise<void> {
	if (configuration.eventCreatedAtLimits && configuration.eventCreatedAtLimits.lower && configuration.eventCreatedAtLimits.upper) {
		const lowerLimit = new Date(Date.now() - (configuration.eventCreatedAtLimits.lower * 1000)).getTime() / 1000;
		const upperLimit = new Date(Date.now() + (configuration.eventCreatedAtLimits.upper * 1000)).getTime() / 1000;
		if (message.created_at < lowerLimit || message.created_at > upperLimit) {
			ws.send(JSON.stringify(["OK", message.id, false, `invalid: the event created_at field is out of the acceptable range (-${durationToString(configuration.eventCreatedAtLimits.lower)}, +${durationToString(configuration.eventCreatedAtLimits.upper)}) for this relay`]));
			console.log(`Received message with createdAt outside of limits`, message);
			return
		}
	}

	await insertEvent(configuration, ws, dataProvider, message, sendEventToSubscribers);
}
