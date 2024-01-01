export interface Configuration {
	/**
	 * The name of your nostr relay.
	 *
	 * This will be sent as part of the Relay Information Document ([NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)).
	 */
	"name"?: string;
	/**
	 * The description of your nostr relay.
	 *
	 * This will be sent as part of the Relay Information Document ([NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)).
	 */
	"description"?: string;
	/**
	 * The public key of the nostr user who administers this relay.
	 *
	 * This will be sent as part of the Relay Information Document ([NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)).
	 */
	"pubkey"?: string;
	/**
	 * The contact URI of the user who administers this relay. This field should be a URI, using schemes such as `mailto` or `https` to provide users with a means of contact
	 *
	 * This will be sent as part of the Relay Information Document ([NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)).
	 */
	"contact"?: string;
	/**
	 * A URL pointing to an image to be used as an icon for the relay. Recommended to be squared in shape.
	 *
	 * This will be sent as part of the Relay Information Document ([NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)).
	 */
	"icon"?: string;
	/**
	 * The type of storage to use for storing data.
	 */
	"storage": {
		"type": StorageType;
	};
	/**
	 * The limits for the `created_at` field of events.
	 *
	 * If an event is received with a `created_at` field outside of these limits, it will be rejected.
	 *
	 * This will be sent as part of the Relay Information Document ([NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md)).
	 */
	"eventCreatedAtLimits"?: {
		/**
		 * The lower bound for the `created_at` field of events, in seconds.
		 *
		 * The server will take the current time, subtract this value, and use that as the lower limit for the `created_at` field of events.
		 */
		"lower": number;
		/**
		 * The upper limit for the `created_at` field of events, in seconds.
		 *
		 * The server will take the current time, add this value, and use that as the upper limit for the `created_at` field of events.
		 */
		"upper": number;
	};
	/**
	 * An array of public keys that are allowed to send events to this relay.
	 *
	 * If this field is not present, all public keys are allowed to send events to this relay.
	 *
	 * If this field is an empty array, no public keys are allowed to send events to this relay.
	 */
	"allowedPublicKeys"?: string[];
	/**
	 * If the relay should always store events that are marked as replaceable.
	 *
	 * If this is set to `true`, the relay will never delete replaceable events.
	 *
	 * If this is set to `false` or `undefined`, the relay will delete replaceable events once they are superseded by another event.
	 */
	"alwaysStoreReplaceableEvents"?: boolean;
}

export type StorageType = "inmemory" | "filesystem" | "sqlite";
