import { randomUUID } from "crypto";
import WebSocket from "ws";
import { FiltersObject } from "./types/FiltersObject";
import { Subscription } from "./types/Subscription";
import { Event } from "./types/Event";
import { EventKind } from "./types/EventKind";
import { filtersMatchEvent } from "./utils/filtersMatchEvent";
import { DataProvider } from "./types/DataProvider";
import { Configuration, StorageType } from "./types/Configuration";
import { normalizeSubscriptionLimit, resolveResourceLimits } from "./utils/resourceLimits";

import express from "express";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const configuration: Configuration = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config.json"), "utf8"));

import packageJson from "../package.json";

import EventTextHandler from "./business_logic/event/text";
import EventDeletionHandler from "./business_logic/event/deletion";
import EventInsertHandler from "./business_logic/event/insert";

type ClientId = `${string}-${string}-${string}-${string}-${string}`;

interface ClientState {
	"ws": WebSocket;
	"ip": string;
	"isAlive": boolean;
	"lastActivityAt": number;
}

(async () => {
	const app = express();
	const server = http.createServer(app);
	const resourceLimits = resolveResourceLimits(configuration);

	const wss = new WebSocket.Server({
		"server": server,
		"maxPayload": resourceLimits.maxMessageBytes
	});

	let clients: {[key: string]: ClientState} = {};
	let subscriptions: {[key: string]: Subscription[]} = {};
	let connectionCountsByIp: {[key: string]: number} = {};

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
			if (!response.limitation) {
				response.limitation = {};
			}
			response.limitation["max_limit"] = resourceLimits.maxSubscriptionLimit;
			response.limitation["max_message_length"] = resourceLimits.maxMessageBytes;
			response.limitation["max_subscriptions"] = resourceLimits.maxSubscriptionsPerConnection;
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
					const client = clients[uuid];
					if (client && client.ws.readyState === WebSocket.OPEN) {
						client.ws.send(JSON.stringify(["EVENT", subscription.id, event]));
					}
				}
			});
		});
	}

	/**
	 * Sends a Nostr NOTICE if the connection can still receive messages.
	 */
	function sendNotice(ws: WebSocket, message: string): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(["NOTICE", message]));
		}
	}

	/**
	 * Releases all per-client resources and decrements the IP connection count.
	 */
	function cleanupClient(uuid: ClientId): void {
		const client = clients[uuid];
		if (!client) {
			return;
		}

		connectionCountsByIp[client.ip] = Math.max((connectionCountsByIp[client.ip] ?? 1) - 1, 0);
		if (connectionCountsByIp[client.ip] === 0) {
			delete connectionCountsByIp[client.ip];
		}

		delete clients[uuid];
		delete subscriptions[uuid];
	}

	/**
	 * Extracts the best available remote IP for coarse connection limiting.
	 */
	function getConnectionIp(request: http.IncomingMessage): string {
		const forwardedFor = request.headers["x-forwarded-for"];
		if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
			return forwardedFor.split(",")[0].trim();
		}

		return request.socket.remoteAddress ?? "unknown";
	}

	wss.on("connection", (ws, request) => {
		const ip = getConnectionIp(request);
		if ((connectionCountsByIp[ip] ?? 0) >= resourceLimits.maxConnectionsPerIp) {
			sendNotice(ws, "too many connections from this IP");
			ws.close(1008, "too many connections");
			console.warn("Rejected client connection", {
				"ip": ip,
				"maxConnectionsPerIp": resourceLimits.maxConnectionsPerIp
			});
			return;
		}

		const uuid = randomUUID() as ClientId;
		connectionCountsByIp[ip] = (connectionCountsByIp[ip] ?? 0) + 1;
		clients[uuid] = {
			"ws": ws,
			"ip": ip,
			"isAlive": true,
			"lastActivityAt": Date.now()
		};
		subscriptions[uuid] = [];
		console.log("Client connected", {
			"uuid": uuid,
			"ip": ip,
			"connectionCountForIp": connectionCountsByIp[ip]
		});

		ws.on("message", async (message: Buffer) => {
			const client = clients[uuid];
			if (!client) {
				return;
			}
			client.lastActivityAt = Date.now();

			if (message.length > resourceLimits.maxMessageBytes) {
				sendNotice(ws, `message too large; max size is ${resourceLimits.maxMessageBytes} bytes`);
				ws.close(1009, "message too large");
				return;
			}

			const messageString: string = message.toString();
			let messageObject: any;

			try {
				messageObject = JSON.parse(messageString);
			} catch (e) {
				sendNotice(ws, "invalid: message is not valid JSON");
				console.error("Received message that is not valid JSON", {
					"uuid": uuid,
					"ip": ip,
					"byteLength": message.length
				});
				return;
			}

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
							console.error("Received message with unsupported event kind", {
								"id": message.id,
								"kind": message.kind,
								"pubkey": message.pubkey
							});
							break;
					}

					break;
				}
				case "REQ": {
					const id = messageObject[1];
					const rawFilters = messageObject[2] ?? {};
					if (typeof id !== "string" || rawFilters === null || typeof rawFilters !== "object" || Array.isArray(rawFilters)) {
						sendNotice(ws, "invalid: REQ must include a subscription id and filter object");
						break;
					}

					const normalizedLimit = normalizeSubscriptionLimit(rawFilters.limit, resourceLimits);
					const filters: FiltersObject = {
						...rawFilters,
						"limit": normalizedLimit.limit
					};
					if (normalizedLimit.notice) {
						sendNotice(ws, `${normalizedLimit.notice} for subscription ${id}`);
					}

					const activeSubscriptions = subscriptions[uuid] ?? [];
					const existingSubscriptionIndex = activeSubscriptions.findIndex((subscription) => subscription.id === id);
					if (existingSubscriptionIndex === -1 && activeSubscriptions.length >= resourceLimits.maxSubscriptionsPerConnection) {
						sendNotice(ws, `too many subscriptions; max is ${resourceLimits.maxSubscriptionsPerConnection}`);
						console.warn("Rejected subscription request", {
							"uuid": uuid,
							"ip": ip,
							"subscriptionId": id,
							"activeSubscriptions": activeSubscriptions.length
						});
						break;
					}

					if (existingSubscriptionIndex === -1) {
						activeSubscriptions.push({
							"id": id,
							"filters": filters
						});
					} else {
						activeSubscriptions[existingSubscriptionIndex] = {
							"id": id,
							"filters": filters
						};
					}
					subscriptions[uuid] = activeSubscriptions;

					const startedAt = Date.now();
					let eventCount = 0;
					try {
						eventCount = await dataProvider.events.query(filters, { "limit": filters.limit ?? resourceLimits.defaultSubscriptionLimit }, (event: Event) => {
							if (ws.readyState === WebSocket.OPEN) {
								ws.send(JSON.stringify(["EVENT", id, event]));
							}
						});

						// EOSE is sent once all initial bounded events have been sent.
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(JSON.stringify(["EOSE", id]));
						}
					} catch (error) {
						sendNotice(ws, "error: failed to process subscription");
						console.error("Failed to process subscription request", {
							"uuid": uuid,
							"ip": ip,
							"subscriptionId": id,
							"error": error
						});
						break;
					}

					console.log("Processed subscription request", {
						"uuid": uuid,
						"ip": ip,
						"subscriptionId": id,
						"limit": filters.limit,
						"filterKeys": Object.keys(filters).filter((key) => key !== "limit"),
						"eventCount": eventCount,
						"durationMs": Date.now() - startedAt
					});
					break;
				}
				case "CLOSE": {
					if (!subscriptions[uuid]) {
						break;
					}

					const id = messageObject[1];

					subscriptions[uuid] = subscriptions[uuid].filter((subscription: Subscription) => subscription.id !== id);

					console.log("Received subscription close", {
						"uuid": uuid,
						"ip": ip,
						"subscriptionId": id
					});
					break;
				}
				default:
					sendNotice(ws, `unsupported message type: ${type}`);
					console.log("Unimplemented message type", {
						"uuid": uuid,
						"ip": ip,
						"type": type
					});
					break;
			}
		});

		ws.on("close", () => {
			cleanupClient(uuid);
			console.log("Client disconnected", {
				"uuid": uuid,
				"ip": ip
			});
		});

		ws.on("error", (error) => {
			cleanupClient(uuid);
			console.error("Client WebSocket error", {
				"uuid": uuid,
				"ip": ip,
				"error": error
			});
		});

		ws.on("pong", () => {
			const client = clients[uuid];
			if (client) {
				client.isAlive = true;
				client.lastActivityAt = Date.now();
			}
		});
	});

	setInterval(() => {
		const now = Date.now();
		Object.entries(clients).forEach(([uuid, client]) => {
			if (client.ws.readyState !== WebSocket.OPEN) {
				cleanupClient(uuid as ClientId);
				return;
			}

			const idleTime = now - client.lastActivityAt;
			if (idleTime > resourceLimits.idleTimeoutSeconds * 1000) {
				sendNotice(client.ws, "idle timeout");
				client.ws.close(1001, "idle timeout");
				cleanupClient(uuid as ClientId);
				console.log("Closed idle client", {
					"uuid": uuid,
					"ip": client.ip,
					"idleMs": idleTime
				});
				return;
			}

			if (!client.isAlive) {
				client.ws.terminate();
				cleanupClient(uuid as ClientId);
				console.log("Terminated unresponsive client", {
					"uuid": uuid,
					"ip": client.ip
				});
				return;
			}

			client.isAlive = false;
			client.ws.ping();
		});
	}, resourceLimits.pingIntervalSeconds * 1000);

	let isRunningPurgeExpiredEvents = false;
	setInterval(async () => {
		if (isRunningPurgeExpiredEvents) {
			console.log("Purge expired events is already running");
			return;
		}
		isRunningPurgeExpiredEvents = true;
		try {
			console.log("Purging expired events");
			const purgedEventCount = await dataProvider.events.purgeExpired();
			console.log("Successfully purged expired events", {
				"purgedEventCount": purgedEventCount
			});
		} catch (error) {
			console.error(`Failed to purge expired events: `, error);
		}
		isRunningPurgeExpiredEvents = false;
	}, 60000);

	setInterval(async () => {
		// Every 15 seconds print the number of connected clients.
		console.log(`Number of connected clients: ${Object.keys(clients).length}`);
	}, 15000);

	server.listen(8080, () => console.log("Server is running on port 8080"));
})();
