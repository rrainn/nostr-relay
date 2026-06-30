type TagFilterValue = string | string[];

interface FiltersObjectMain {
	"ids"?: string[];
	"authors"?: string[];
	"kinds"?: number[];
	"since"?: number;
	"until"?: number;
	/**
	 * Only valid for initial query.
	 */
	"limit"?: number;
}

export type FiltersObject = FiltersObjectMain & {
	[key: `#${string}`]: TagFilterValue | undefined;
};
