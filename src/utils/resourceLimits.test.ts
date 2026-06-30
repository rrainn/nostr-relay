import { Configuration } from "../types/Configuration";
import { normalizeSubscriptionLimit, resolveResourceLimits } from "./resourceLimits";

const configuration: Configuration = {
	"storage": {
		"type": "inmemory"
	},
	"resourceLimits": {
		"defaultSubscriptionLimit": 50,
		"maxSubscriptionLimit": 100
	}
};

/**
 * Builds the shared resolved limits used by these normalization tests.
 */
function getLimits() {
	return resolveResourceLimits(configuration);
}

test.each([
	[undefined, 50],
	[0, 50],
	[-1, 50],
	[101, 100],
	[25, 25]
])("normalizeSubscriptionLimit(%p)", (requestedLimit, expectedLimit) => {
	expect(normalizeSubscriptionLimit(requestedLimit, getLimits()).limit).toBe(expectedLimit);
});

test("resolveResourceLimits caps the default limit to the configured max", () => {
	const limits = resolveResourceLimits({
		"storage": {
			"type": "inmemory"
		},
		"resourceLimits": {
			"defaultSubscriptionLimit": 200,
			"maxSubscriptionLimit": 100
		}
	});

	expect(limits.defaultSubscriptionLimit).toBe(100);
	expect(limits.maxSubscriptionLimit).toBe(100);
});
