import { Configuration } from "../types/Configuration";

export interface ResolvedResourceLimits {
	"defaultSubscriptionLimit": number;
	"maxSubscriptionLimit": number;
	"maxSubscriptionsPerConnection": number;
	"maxConnectionsPerIp": number;
	"maxMessageBytes": number;
	"idleTimeoutSeconds": number;
	"pingIntervalSeconds": number;
}

export interface NormalizedSubscriptionLimit {
	"limit": number;
	"notice"?: string;
}

const DEFAULT_RESOURCE_LIMITS: ResolvedResourceLimits = {
	"defaultSubscriptionLimit": 500,
	"maxSubscriptionLimit": 1000,
	"maxSubscriptionsPerConnection": 32,
	"maxConnectionsPerIp": 64,
	"maxMessageBytes": 64 * 1024,
	"idleTimeoutSeconds": 120,
	"pingIntervalSeconds": 30
};

/**
 * Resolves configured resource limits while preserving safe defaults.
 */
export function resolveResourceLimits(configuration: Configuration): ResolvedResourceLimits {
	const configuredLimits = configuration.resourceLimits ?? {};
	const maxSubscriptionLimit = positiveIntegerOrDefault(configuredLimits.maxSubscriptionLimit, DEFAULT_RESOURCE_LIMITS.maxSubscriptionLimit);
	const defaultSubscriptionLimit = Math.min(
		positiveIntegerOrDefault(configuredLimits.defaultSubscriptionLimit, DEFAULT_RESOURCE_LIMITS.defaultSubscriptionLimit),
		maxSubscriptionLimit
	);

	return {
		"defaultSubscriptionLimit": defaultSubscriptionLimit,
		"maxSubscriptionLimit": maxSubscriptionLimit,
		"maxSubscriptionsPerConnection": positiveIntegerOrDefault(configuredLimits.maxSubscriptionsPerConnection, DEFAULT_RESOURCE_LIMITS.maxSubscriptionsPerConnection),
		"maxConnectionsPerIp": positiveIntegerOrDefault(configuredLimits.maxConnectionsPerIp, DEFAULT_RESOURCE_LIMITS.maxConnectionsPerIp),
		"maxMessageBytes": positiveIntegerOrDefault(configuredLimits.maxMessageBytes, DEFAULT_RESOURCE_LIMITS.maxMessageBytes),
		"idleTimeoutSeconds": positiveIntegerOrDefault(configuredLimits.idleTimeoutSeconds, DEFAULT_RESOURCE_LIMITS.idleTimeoutSeconds),
		"pingIntervalSeconds": positiveIntegerOrDefault(configuredLimits.pingIntervalSeconds, DEFAULT_RESOURCE_LIMITS.pingIntervalSeconds)
	};
}

/**
 * Converts a client-provided subscription limit into a bounded database limit.
 */
export function normalizeSubscriptionLimit(limit: unknown, limits: ResolvedResourceLimits): NormalizedSubscriptionLimit {
	if (!Number.isInteger(limit) || (limit as number) <= 0) {
		return {
			"limit": limits.defaultSubscriptionLimit,
			"notice": `subscription limit was set to ${limits.defaultSubscriptionLimit}`
		};
	}

	if ((limit as number) > limits.maxSubscriptionLimit) {
		return {
			"limit": limits.maxSubscriptionLimit,
			"notice": `subscription limit was capped at ${limits.maxSubscriptionLimit}`
		};
	}

	return {
		"limit": limit as number
	};
}

/**
 * Keeps numeric resource settings positive integers.
 */
function positiveIntegerOrDefault(value: unknown, defaultValue: number): number {
	if (!Number.isInteger(value) || (value as number) <= 0) {
		return defaultValue;
	}

	return value as number;
}
