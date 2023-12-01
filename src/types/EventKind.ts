export enum EventKind {
	METADATA = 0,
	TEXT = 1,
	EVENT_DELETION = 5
}

export enum EventKindType {
	unknown = 0,
	regular = 1,
	replaceable = 2,
	ephemeral = 3,
	parameterized_replaceable = 4,
}
