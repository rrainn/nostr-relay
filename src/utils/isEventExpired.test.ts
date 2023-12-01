import isEventExpired from "./isEventExpired";

test.concurrent.each([
	{
		"id": "id",
		"pubkey": "pubkey",
		"created_at": Date.now(),
		"kind": 1,
		"tags": [
			["expiration", "1"]
		],
		"content": "Expired event 1",
		"sig": "sig"
	},
	{
		"id": "id",
		"pubkey": "pubkey",
		"created_at": Date.now(),
		"kind": 1,
		"tags": [
			["expiration", "100"]
		],
		"content": "Expired event 2",
		"sig": "sig"
	}
])(`isEventExpired(%i) === true`, async (event) => {
	expect(isEventExpired(event)).toStrictEqual(true);
});

test.concurrent.each([
	{
		"id": "id",
		"pubkey": "pubkey",
		"created_at": Date.now(),
		"kind": 1,
		"tags": [],
		"content": "Non Expired Event",
		"sig": "sig"
	},
	{
		"id": "id",
		"pubkey": "pubkey",
		"created_at": Date.now(),
		"kind": 1,
		"tags": [
			["expiration", `${Date.now() + 60000}`]
		],
		"content": "Non Expired Event",
		"sig": "sig"
	}
])(`isEventExpired(%i) === false`, async (event) => {
	expect(isEventExpired(event)).toStrictEqual(false);
});
