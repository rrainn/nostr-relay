export enum EventKind {
	METADATA = 0,
	TEXT = 1,
	EVENT_DELETION = 5
}

export enum EventKindType {
	unknown = 0,
	/**
	 * Event expected to be stored by relays.
	 */
	regular = 1,
	/**
	 * Only the latest event for each combination of `pubkey` and `kind` is expected to be stored by relays. Older events may be discarded.
	 */
	replaceable = 2,
	/**
	 * Event not expected to be stored by relays.
	 */
	ephemeral = 3,
	/**
	 * Event is addressable by their `kind`, `pubkey` and the value of their `d` tag. Only the latest event for each combination of those values should be stored by relays. Older events may be discarded.
	 */
	parameterized_replaceable = 4,
}
