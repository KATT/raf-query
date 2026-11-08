import type { Bundle } from "./bundle.ts";

/**
 * How to tell a feature is in a bundle: a module with code in it
 * (`<package>/<path>`, from `src/` or `dist/`, without the extension), or a
 * string that survives minification (for a feature that shares a module
 * with others).
 */
type Marker = { readonly code: string } | { readonly module: string };

export const features = {
	boundary: {
		label: "`QueryBoundary`",
		marker: { module: "boundary/index" },
	},
	devtools: {
		label: "devtools",
		marker: { module: "react/devtools" },
	},
	focusRefetch: {
		label: "`focusRefetch()`",
		marker: { module: "core/features/focus-refetch/focus-refetch" },
	},
	hooks: {
		label: "React hooks",
		marker: { module: "react/use-query" },
	},
	hydration: {
		label: "hydration",
		marker: { module: "core/hydration/hydration" },
	},
	paging: {
		label: "paging (`useInfiniteQuery`)",
		marker: { module: "core/infinite/infinite" },
	},
	polling: {
		label: "`polling()`",
		marker: { module: "core/features/polling/polling" },
	},
	reconnectRefetch: {
		label: "`reconnectRefetch()`",
		marker: { module: "core/features/reconnect-refetch/reconnect-refetch" },
	},
	retry: {
		label: "`retry()`",
		marker: { module: "core/links/retry/retry" },
	},
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
	"paging",
	"boundary",
	"devtools",
];

/** Typed as `Marker`, so a string marker stays possible when every feature has a module. */
function markerOf(feature: Feature): Marker {
	return features[feature].marker;
}

export function hasFeature(bundle: Bundle, feature: Feature): boolean {
	const marker = markerOf(feature);
	if ("code" in marker) {
		return bundle.code.includes(marker.code);
	}
	const [pkg, ...path] = marker.module.split("/");
	const module = new RegExp(
		`/packages/${pkg}/(src|dist)/${path.join("/")}\\.(ts|tsx|mjs)$`,
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
		fixture: "bound.tsx",
		imports: ["hooks"],
		name: "+ bound `queryOptions` and `useQueryClient`",
	},
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
		fixture: "infinite.tsx",
		imports: ["hooks", "paging"],
		name: "+ a paged query (`useInfiniteQuery`)",
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
		fixture: "devtools.tsx",
		imports: ["hooks", "devtools"],
		name: "+ devtools (`QueryDevtools`)",
	},
	{
		fixture: "devtools-dev-only.tsx",
		imports: ["hooks"],
		name: "+ devtools behind a development check, in production",
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
		imports: featureIds.filter((feature) => feature !== "devtools"),
		name: "Everything (`recommended()`, `timeout()`, hydration, paging, boundary)",
	},
];
