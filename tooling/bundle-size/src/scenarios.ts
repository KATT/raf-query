import type { Bundle } from "./bundle.ts";

/**
 * How to tell a feature is in a bundle: a module with code in it
 * (`<package>/<file>`, from `src/` or `dist/`), or a string that survives
 * minification (for features that share a module with others).
 */
type Marker = { readonly code: string } | { readonly module: string };

export const features = {
	boundary: {
		label: "`QueryBoundary`",
		marker: { module: "boundary/index" },
	},
	focusRefetch: {
		label: "`focusRefetch()`",
		marker: { code: "visibilitychange" },
	},
	hooks: {
		label: "React hooks",
		marker: { module: "react/use-query" },
	},
	hydration: {
		label: "hydration",
		marker: { module: "core/hydration" },
	},
	polling: { label: "`polling()`", marker: { code: "refetchInterval" } },
	reconnectRefetch: {
		label: "`reconnectRefetch()`",
		marker: { code: "refetchOnReconnect" },
	},
	retry: { label: "`retry()`", marker: { code: "[object Response]" } },
	tags: { label: "tags", marker: { code: ".tags" } },
} satisfies Record<string, { readonly label: string; readonly marker: Marker }>;

export type Feature = keyof typeof features;

/** Every opt-in feature, in report order. */
export const featureIds: ReadonlyArray<Feature> = [
	"hooks",
	"hydration",
	"retry",
	"polling",
	"focusRefetch",
	"reconnectRefetch",
	"tags",
	"boundary",
];

export function hasFeature(bundle: Bundle, feature: Feature): boolean {
	const marker: Marker = features[feature].marker;
	if ("code" in marker) {
		return bundle.code.includes(marker.code);
	}
	const [pkg, file] = marker.module.split("/");
	const module = new RegExp(
		`/packages/${pkg}/(src|dist)/${file}\\.(ts|tsx|mjs)$`,
	);
	return [...bundle.modules.keys()].some((id) => module.test(id));
}

export interface Scenario {
	/** Fixture under `fixtures/`, bundled as the entry. */
	readonly fixture: string;
	/** The opt-in features it imports; every other one must be absent. */
	readonly imports: ReadonlyArray<Feature>;
	readonly name: string;
}

/** The base budget: a client, `load` and `useQuery`, nothing opt-in. */
export const budget = { gzip: 5 * 1024, scenario: "hooks.tsx" };

export const scenarios: ReadonlyArray<Scenario> = [
	{ fixture: "core.ts", imports: [], name: "Core only" },
	{ fixture: "hooks.tsx", imports: ["hooks"], name: "+ React hooks" },
	{
		fixture: "hydration.tsx",
		imports: ["hooks", "hydration"],
		name: "+ hydration (`HydrationBoundary`)",
	},
	{ fixture: "retry.tsx", imports: ["hooks", "retry"], name: "+ `retry()`" },
	{
		fixture: "polling.tsx",
		imports: ["hooks", "polling"],
		name: "+ `polling()`",
	},
	{
		fixture: "focus-refetch.tsx",
		imports: ["hooks", "focusRefetch"],
		name: "+ `focusRefetch()`",
	},
	{
		fixture: "reconnect-refetch.tsx",
		imports: ["hooks", "reconnectRefetch"],
		name: "+ `reconnectRefetch()`",
	},
	{
		fixture: "tags.tsx",
		imports: ["hooks", "tags"],
		name: "+ tags (`groups()`, `tag`)",
	},
	{
		fixture: "streams.tsx",
		imports: ["hooks"],
		name: "+ a stream query",
	},
	{
		fixture: "boundary.tsx",
		imports: ["hooks", "boundary"],
		name: "+ `QueryBoundary`",
	},
	{
		fixture: "tanstack-defaults.tsx",
		imports: [
			"hooks",
			"hydration",
			"retry",
			"polling",
			"focusRefetch",
			"reconnectRefetch",
		],
		name: "TanStack defaults (`retry()`, focus and reconnect refetch, `polling()`, hydration)",
	},
	{
		fixture: "everything.tsx",
		imports: featureIds,
		name: "Everything (`recommended()`, `timeout()`, tags, hydration, boundary)",
	},
];
