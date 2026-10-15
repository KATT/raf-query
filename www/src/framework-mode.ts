import { z } from "zod";

/** Homepage (and later docs) examples: which framework the samples show. */
export const frameworkModes = ["tanstack-start", "nextjs"] as const;

export type FrameworkMode = (typeof frameworkModes)[number];

export const defaultFrameworkMode: FrameworkMode = "tanstack-start";

/** Defaults stripped from the URL by `stripSearchParams` on `/`. */
export const homeSearchDefaults = {
	mode: defaultFrameworkMode,
} as const;

export const frameworkModeLabels = {
	nextjs: "Next.js",
	"tanstack-start": "TanStack Start",
} as const satisfies Record<FrameworkMode, string>;

/** Search on `/`: `?mode=nextjs`, or omitted for TanStack Start. */
export const homeSearchSchema = z.object({
	mode: z.enum(frameworkModes).default(homeSearchDefaults.mode),
});

export type HomeSearch = z.infer<typeof homeSearchSchema>;

export function parseFrameworkMode(value: string | undefined): FrameworkMode {
	return value === "nextjs" ? "nextjs" : defaultFrameworkMode;
}

/** Drop the default from the URL so `/` stays clean. */
export function frameworkModeSearch(
	mode: FrameworkMode,
): Pick<HomeSearch, "mode"> | Record<string, never> {
	return mode === defaultFrameworkMode ? {} : { mode };
}
