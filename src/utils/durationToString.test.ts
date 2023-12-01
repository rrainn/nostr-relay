import { durationToString } from "./durationToString";

test.concurrent.each([
	[1, "1s"],
	[59, "59s"],
	[60, "1m"],
	[61, "1m 1s"],
	[3599, "59m 59s"],
	[3600, "1h"],
	[3601, "1h 1s"],
	[86399, "23h 59m 59s"],
	[86400, "1d"],
	[86401, "1d 1s"],
	[86459, "1d 59s"],
	[86460, "1d 1m"],
	[86461, "1d 1m 1s"],
	[90000, "1d 1h"]
])(`durationToString(%i)`, async (duration, expected) => {
	expect(durationToString(duration)).toBe(expected);
});
