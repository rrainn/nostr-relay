import { EventKind } from "./EventKind";
import { Tag } from "./Tag";

export interface Event {
	"id": string;
	"pubkey": string;
	"created_at": number;
	"kind": EventKind;
	"tags": Tag[];
	"content": string;
	"sig": string;
}
