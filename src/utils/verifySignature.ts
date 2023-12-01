import * as crypto from "crypto";
import { schnorr } from "@noble/curves/secp256k1";

export function verifyNostrSignature(event: any): boolean {
	try {
		const hash = getEventHash(event);
		if (hash !== event.id) {
			return false;
		}

		return schnorr.verify(event.sig, hash, event.pubkey);
	} catch (e) {
		console.error(e);
		return false;
	}
}

function getEventHash(event: any): string {
	const serializedEvent = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);

	const hash = crypto.createHash("sha256");
	hash.update(serializedEvent);
	return hash.digest("hex");
}
