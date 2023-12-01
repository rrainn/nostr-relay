import { randomUUID } from "crypto";
import WebSocket from "ws";
import { FiltersObject } from "./types/FiltersObject";
import { Subscription } from "./types/Subscription";
import { Event } from "./types/Event";
import { EventKind, EventKindType } from "./types/EventKind";
import { filtersMatchEvent } from "./utils/filtersMatchEvent";
import { DataProvider } from "./types/DataProvider";
import { Configuration, StorageType } from "./types/Configuration";

import express from "express";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const configuration: Configuration = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config.json"), "utf8"));

import packageJson from "../package.json";

import EventTextHandler from "./business_logic/event/text";
import EventDeletionHandler from "./business_logic/event/deletion";
import EventInsertHandler from "./business_logic/event/insert";
import getEventKindType from "./utils/getEventKindType";

(async () => {
	const app = express();
	const server = http.createServer(app);

	const wss = new WebSocket.Server({
		server
	});

	let clients: {[key: `${string}-${string}-${string}-${string}-${string}`]: any} = {};
	let subscriptions: {[key: `${string}-${string}-${string}-${string}-${string}`]: Subscription[]} = {};

	const dataProvider: DataProvider = await (async () => {
		const providerType: StorageType = configuration.storage.type;
		switch (providerType) {
			case "inmemory": {
				const { default: provider } = await import("./data_providers/inmemory");
				return provider;
			}
			case "filesystem": {
				const { default: provider } = await import("./data_providers/filesystem");
				return provider;
			}
			case "sqlite": {
				const { default: provider } = await import("./data_providers/sqlite/index");
				return provider;
			}
			default: {
				throw new Error(`Invalid data provider: ${providerType}`);
			}
		}
	})() as DataProvider;
	await dataProvider.setup();

	app.get("/", (req, res, next) => {
		if (req.get("Accept") === "application/nostr+json") {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
			res.setHeader('Access-Control-Allow-Methods', 'GET');

			const response: {[key: string]: any} = {
				"supported_nips": [
					1,
					9,
					11,
					22,
					40
				],
				"software": packageJson.homepage,
				"version": packageJson.version
			};

			if (configuration.name) {
				response["name"] = configuration.name;
			}
			if (configuration.description) {
				response["description"] = configuration.description;
			}
			if (configuration.pubkey) {
				response["pubkey"] = configuration.pubkey;
			}
			if (configuration.contact) {
				response["contact"] = configuration.contact;
			}
			if (configuration.icon) {
				response["icon"] = configuration.icon;
			}
			if (configuration.eventCreatedAtLimits && configuration.eventCreatedAtLimits.lower && configuration.eventCreatedAtLimits.upper) {
				if (!response.limitation) {
					response.limitation = {};
				}
				response.limitation["created_at_lower_limit"] = configuration.eventCreatedAtLimits.lower;
				response.limitation["created_at_upper_limit"] = configuration.eventCreatedAtLimits.upper;
			}
			if (configuration.allowedPublicKeys) {
				if (!response.limitation) {
					response.limitation = {};
				}
				response.limitation["restricted_writes"] = true;
			}
			res.json(response);
		} else {
			next();
		}
	});

	function sendEventToSubscribers(event: Event) {
		Object.entries(subscriptions).forEach(([uuid, subscriptions]) => {
			subscriptions.forEach((subscription: Subscription) => {
				const filters = subscription.filters;
				if (filtersMatchEvent(filters, event)) {
					clients[uuid as `${string}-${string}-${string}-${string}-${string}`].send(JSON.stringify(["EVENT", subscription.id, event]));
				}
			});
		});
	}

	wss.on("connection", (ws) => {
		const uuid = randomUUID();
		console.log(`Client connected: ${uuid}`);

		clients[uuid] = ws;

		ws.on("message", async (message: Buffer) => {
			const messageString: string = message.toString();
			const messageObject = JSON.parse(messageString);

			const type = messageObject[0];

			switch (type) {
				case "EVENT": {
					const message: Event = messageObject[1];

					switch (message.kind) {
						case EventKind.METADATA:
							await EventInsertHandler(configuration, ws, dataProvider, message, sendEventToSubscribers);
							break;
						case EventKind.TEXT:
							await EventTextHandler(configuration, ws, dataProvider, message, sendEventToSubscribers);
							break;
						case EventKind.EVENT_DELETION:
							await EventDeletionHandler(configuration, ws, dataProvider, message, sendEventToSubscribers);
							break;
						default:
							ws.send(JSON.stringify(["OK", message.id, false, "invalid: unsupported event kind"]));
							console.error(`Received message with unsupported event kind`, message);
							break;
					}

					break;
				}
				case "REQ": {
					const id = messageObject[1];
					const filters: FiltersObject = messageObject[2];

					subscriptions[uuid] = subscriptions[uuid] || [];
					subscriptions[uuid].push({
						"id": id,
						"filters": filters
					});

					const matchedEvents = (await dataProvider.events.getAll()).filter((event: Event) => filtersMatchEvent(filters, event));
					const filteredReplaceableEvents = matchedEvents.filter((event: Event, _i: number, array: Event[]) => {
						const kindType = getEventKindType(event.kind);
						if (kindType === EventKindType.replaceable) {
							const isLatest = array.filter((e: Event) => e.pubkey === event.pubkey && e.kind === event.kind).sort((a: Event, b: Event) => b.created_at - a.created_at)[0].id === event.id;
							return isLatest;
						} else if (kindType === EventKindType.parameterized_replaceable) {
							const isLatest = array.filter((e: Event) => {
								return e.pubkey === event.pubkey && e.kind === event.kind && e.tags.find((t) => t[0] === "d")?.[1] === event.tags.find((t) => t[0] === "d")?.[1];
							}).sort((a: Event, b: Event) => b.created_at - a.created_at)[0].id === event.id;
							return isLatest;
						}

						return true;
					});

					for (let i = 0; i < Math.min(filteredReplaceableEvents.length, filters.limit ?? filteredReplaceableEvents.length); i++) {
						const event = filteredReplaceableEvents[i];
						console.log(`Sending event to client: ${id}`, event);
						ws.send(JSON.stringify(["EVENT", id, event]));
					}

					// EOSE should be sent once all initial events have been sent (either by limit being reached, or no more events matching the filters)
					// https://github.com/nostr-protocol/nips/discussions/906#discussioncomment-7719394
					ws.send(JSON.stringify(["EOSE", id]));

					console.log(`Received subscription request: ${id}`, filters);
					break;
				}
				case "CLOSE": {
					if (!subscriptions[uuid]) {
						break;
					}

					const id = messageObject[1];

					subscriptions[uuid] = subscriptions[uuid].filter((subscription: Subscription) => subscription.id !== id);

					console.log(`Received subscription close: ${id}`);
					break;
				}
				default:
					console.log(`Unimplemented type: ${type}`);
					break;
			}
		});

		ws.on("close", () => {
			delete clients[uuid];
			delete subscriptions[uuid];
			console.log(`Client disconnected: ${uuid}`);
		});
	});

	let isRunningPurgeExpiredEvents = false;
	setInterval(async () => {
		if (isRunningPurgeExpiredEvents) {
			console.log("Purge expired events is already running");
			return;
		}
		isRunningPurgeExpiredEvents = true;
		try {
			console.log("Purging expired events");
			await dataProvider.events.purgeExpired();
			console.log("Successfully purged expired events");
		} catch (error) {
			console.error(`Failed to purge expired events: `, error);
		}
		isRunningPurgeExpiredEvents = false;
	}, 60000);

	server.listen(8080, () => console.log("Server is running on port 8080"));
})();
