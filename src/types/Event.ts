import { Tag } from "./Tag";

export interface Event {
	"id": string;
	"pubkey": string;
	"created_at": number;
	"kind": number;
	"tags": Tag[];
	"content": string;
	"sig": string;
}
