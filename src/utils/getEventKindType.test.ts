import { EventKindType } from "../types/EventKind";
import getEventKindType from "./getEventKindType";

test.concurrent.each([
	[0, EventKindType.replaceable],
])(`getEventKindType(%i)`, async (kind, output) => {
	expect(getEventKindType(kind)).toStrictEqual(output);
});
