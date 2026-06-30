import { DataProvider } from "../../types/DataProvider";
import { Event } from "../../types/Event";

jest.setTimeout(60000);

let provider: DataProvider;
const baseCreatedAt = 1_700_000_000;
const bulkEventCount = 20000;

beforeAll(async () => {
	process.env.NOSTR_RELAY_SQLITE_PATH = ":memory:";
	provider = (await import("./index")).default;
	await provider.setup();
	await seedBulkEvents();
	await seedTargetedEvents();
});

afterAll(async () => {
	await provider.teardown?.();
	delete process.env.NOSTR_RELAY_SQLITE_PATH;
});

test("broad queries stay bounded by the storage limit", async () => {
	let eventCount = 0;
	const beforeHeap = process.memoryUsage().heapUsed;

	const returnedRows = await provider.events.query({}, { "limit": 25 }, () => {
		eventCount++;
	});

	const afterHeap = process.memoryUsage().heapUsed;
	expect(returnedRows).toBe(25);
	expect(eventCount).toBe(25);
	expect(afterHeap - beforeHeap).toBeLessThan(64 * 1024 * 1024);
});

test("getAll does not return the whole database for an empty filter", async () => {
	const events = await provider.events.getAll({}, { "limit": 10 });

	expect(events).toHaveLength(10);
});

test("empty list filters match no events instead of broadening the query", async () => {
	const events = await provider.events.getAll({ "ids": [] }, { "limit": 10 });

	expect(events).toHaveLength(0);
});

test("SQL filters by ids authors kinds time and tags", async () => {
	const events = await provider.events.getAll({
		"ids": [fixedId("a1")],
		"authors": ["target-author"],
		"kinds": [1],
		"since": baseCreatedAt + bulkEventCount,
		"until": baseCreatedAt + bulkEventCount + 10,
		"#p": ["target-pubkey"],
		"#e": ["target-event"]
	}, { "limit": 10 });

	expect(events.map((event) => event.id)).toEqual([fixedId("a1")]);
});

test("expired events are excluded from queries and purged without loading rows", async () => {
	const expiredEvent = createEvent(90001, {
		"id": fixedId("ee"),
		"pubkey": "expired-author",
		"created_at": baseCreatedAt + 90001,
		"tags": [["expiration", String(Math.floor(Date.now() / 1000) - 60)]]
	});
	await provider.events.save(expiredEvent);

	const queryResults = await provider.events.getAll({ "ids": [expiredEvent.id] }, { "limit": 10 });
	const purgedCount = await provider.events.purgeExpired();

	expect(queryResults).toHaveLength(0);
	expect(purgedCount).toBeGreaterThanOrEqual(1);
	expect(await provider.events.exists(expiredEvent.id)).toBe(false);
});

test("replaceable event queries return only the latest row per key", async () => {
	const events = await provider.events.getAll({
		"authors": ["replaceable-author"],
		"kinds": [0]
	}, { "limit": 10 });

	expect(events.map((event) => event.id)).toEqual([fixedId("b2")]);
});

test("expired replaceable events do not hide the latest active row", async () => {
	await provider.events.save(createEvent(92001, {
		"id": fixedId("er1"),
		"pubkey": "expired-replaceable-author",
		"created_at": baseCreatedAt + 92001,
		"kind": 0
	}));
	await provider.events.save(createEvent(92002, {
		"id": fixedId("er2"),
		"pubkey": "expired-replaceable-author",
		"created_at": baseCreatedAt + 92002,
		"kind": 0,
		"tags": [["expiration", String(Math.floor(Date.now() / 1000) - 60)]]
	}));

	const events = await provider.events.getAll({
		"authors": ["expired-replaceable-author"],
		"kinds": [0]
	}, { "limit": 10 });

	expect(events.map((event) => event.id)).toEqual([fixedId("er1")]);
});

test("parameterized replaceable queries return only the latest row per d tag", async () => {
	const events = await provider.events.getAll({
		"authors": ["parameterized-author"],
		"kinds": [30000]
	}, { "limit": 10 });

	expect(events.map((event) => event.id)).toEqual([fixedId("c3"), fixedId("c2")]);
});

test("replaceable cleanup deletes superseded stored rows", async () => {
	const newerEvent = createEvent(91002, {
		"id": fixedId("d2"),
		"pubkey": "cleanup-author",
		"created_at": baseCreatedAt + 91002,
		"kind": 0
	});
	await provider.events.save(createEvent(91001, {
		"id": fixedId("d1"),
		"pubkey": "cleanup-author",
		"created_at": baseCreatedAt + 91001,
		"kind": 0
	}));
	await provider.events.save(newerEvent);

	const deletedCount = await provider.events.deleteSupersededReplaceableEvents(newerEvent);

	expect(deletedCount).toBe(1);
	expect(await provider.events.exists(fixedId("d1"))).toBe(false);
	expect(await provider.events.exists(fixedId("d2"))).toBe(true);
});

/**
 * Seeds enough events to catch accidental full-result materialization.
 */
async function seedBulkEvents(): Promise<void> {
	for (let index = 0; index < bulkEventCount; index++) {
		await provider.events.save(createEvent(index));
	}
}

/**
 * Seeds targeted rows used by SQL-side filter and replaceable-event tests.
 */
async function seedTargetedEvents(): Promise<void> {
	await provider.events.save(createEvent(bulkEventCount + 1, {
		"id": fixedId("a1"),
		"pubkey": "target-author",
		"created_at": baseCreatedAt + bulkEventCount + 1,
		"tags": [
			["p", "target-pubkey"],
			["e", "target-event"],
			["t", "sqlite"]
		]
	}));
	await provider.events.save(createEvent(bulkEventCount + 2, {
		"id": fixedId("a2"),
		"pubkey": "target-author",
		"created_at": baseCreatedAt + bulkEventCount + 2,
		"tags": [["p", "other-pubkey"]]
	}));
	await provider.events.save(createEvent(bulkEventCount + 3, {
		"id": fixedId("b1"),
		"pubkey": "replaceable-author",
		"created_at": baseCreatedAt + bulkEventCount + 3,
		"kind": 0
	}));
	await provider.events.save(createEvent(bulkEventCount + 4, {
		"id": fixedId("b2"),
		"pubkey": "replaceable-author",
		"created_at": baseCreatedAt + bulkEventCount + 4,
		"kind": 0
	}));
	await provider.events.save(createEvent(bulkEventCount + 5, {
		"id": fixedId("c1"),
		"pubkey": "parameterized-author",
		"created_at": baseCreatedAt + bulkEventCount + 5,
		"kind": 30000,
		"tags": [["d", "one"]]
	}));
	await provider.events.save(createEvent(bulkEventCount + 6, {
		"id": fixedId("c2"),
		"pubkey": "parameterized-author",
		"created_at": baseCreatedAt + bulkEventCount + 6,
		"kind": 30000,
		"tags": [["d", "one"]]
	}));
	await provider.events.save(createEvent(bulkEventCount + 7, {
		"id": fixedId("c3"),
		"pubkey": "parameterized-author",
		"created_at": baseCreatedAt + bulkEventCount + 7,
		"kind": 30000,
		"tags": [["d", "two"]]
	}));
}

/**
 * Builds a deterministic event with safe defaults for storage tests.
 */
function createEvent(index: number, overrides: Partial<Event> = {}): Event {
	return {
		"id": fixedId(`bulk-${index}`),
		"pubkey": `author-${index % 25}`,
		"created_at": baseCreatedAt + index,
		"kind": 1,
		"tags": [],
		"content": `event-${index}`,
		"sig": `sig-${index}`,
		...overrides
	};
}

/**
 * Creates SQLite-friendly deterministic ids with stable lexical ordering.
 */
function fixedId(suffix: string): string {
	return suffix.padStart(64, "0");
}
