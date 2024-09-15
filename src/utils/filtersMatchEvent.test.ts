import { filtersMatchEvent } from "./filtersMatchEvent";

test.concurrent.each([
	[
		{
			"kinds": [1],
			"authors": ["d77637850017cffa7a61c7032db0f28be947d5487f9d504aabe4449a91b53cff"]
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [],
			"content": "Random content"
		},
		false
	],
	[
		{
			"kinds": [1],
			"authors": ["9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81"]
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [],
			"content": "Random content"
		},
		true
	],
	[
		null,
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [],
			"content": "Random content"
		},
		true
	],
	[
		undefined,
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [],
			"content": "Random content"
		},
		true
	],
	[
		{
			"#p": "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81"
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "54277ee748efa2222204c713ac03f1a5a819887797d06372fa7aa79950328e07",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [
				["p", "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81"]
			],
			"content": "Random content"
		},
		true
	],
	[
		{
			"#p": "277ee748efa2222204c713ac03f1a5a819887797d06372fa7aa79950328e0754"
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "54277ee748efa2222204c713ac03f1a5a819887797d06372fa7aa79950328e07",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [
				["p", "9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81"]
			],
			"content": "Random content"
		},
		false
	],
	[
		{
			"#t": "hello"
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "54277ee748efa2222204c713ac03f1a5a819887797d06372fa7aa79950328e07",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [
				["t", "hello"],
				["t", "linux"]
			],
			"content": "#Hello world. This is a test running on #Linux."
		},
		true
	],
	[
		{
			"#t": "world"
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "54277ee748efa2222204c713ac03f1a5a819887797d06372fa7aa79950328e07",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [
				["t", "hello"],
				["t", "linux"]
			],
			"content": "#Hello world. This is a test running on #Linux."
		},
		false
	],
	[
		{
			"#t": "linux"
		},
		{
			"id": "c9c8eea07db297ab0bee9e60bf1cb40ba13f93eba4ac50797e3aa5e3afe4c80f",
			"pubkey": "54277ee748efa2222204c713ac03f1a5a819887797d06372fa7aa79950328e07",
			"created_at": 1703779327,
			"kind": 1,
			"tags": [
				["t", "hello"],
				["t", "linux"]
			],
			"content": "#Hello world. This is a test running on #Linux."
		},
		true
	],
])(`filtersMatchEvent()`, async (filters, event, expected) => {
	expect(filtersMatchEvent(filters as any, event as any)).toBe(expected);
});
