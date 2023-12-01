import { EventKind, EventKindType } from "../types/EventKind";

export default function (kind: EventKind): EventKindType {
	if (1000 <= kind && kind < 10000) {
		return EventKindType.regular;
	} else if ((10000 <= kind && kind < 20000) || kind === 0/* || kind === 3*/) {
		return EventKindType.replaceable;
	} else if (20000 <= kind && kind < 30000) {
		return EventKindType.ephemeral;
	} else if (30000 <= kind && kind < 40000) {
		return EventKindType.parameterized_replaceable;
	} else {
		return EventKindType.unknown;
	}
}
