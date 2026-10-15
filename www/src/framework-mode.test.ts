import { describe, expect, it } from "@effect/vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";

import {
	defaultFrameworkMode,
	type FrameworkMode,
	frameworkModeSearch,
	homeSearchSchema,
	parseFrameworkMode,
} from "./framework-mode.ts";
import { useFrameworkMode } from "./use-framework-mode.ts";

describe("framework mode", () => {
	it("defaults to TanStack Start when the URL omits mode", () => {
		expect(homeSearchSchema.parse({})).toEqual({
			mode: defaultFrameworkMode,
		});
		expect(parseFrameworkMode(undefined)).toBe("tanstack-start");
	});

	it("accepts nextjs from the search string", () => {
		expect(homeSearchSchema.parse({ mode: "nextjs" })).toEqual({
			mode: "nextjs",
		});
		expect(parseFrameworkMode("nextjs")).toBe("nextjs");
	});

	it("drops the default from the URL", () => {
		expect(frameworkModeSearch("tanstack-start")).toEqual({});
		expect(frameworkModeSearch("nextjs")).toEqual({ mode: "nextjs" });
	});

	it("follows the URL after mount and on later changes", () => {
		const hook = renderHook(
			({ mode }: { mode: FrameworkMode }) => useFrameworkMode(mode),
			{ initialProps: { mode: "tanstack-start" } },
		);
		expect(hook.result.current).toBe("tanstack-start");
		act(() => {
			hook.rerender({ mode: "nextjs" });
		});
		expect(hook.result.current).toBe("nextjs");
		act(() => {
			hook.rerender({ mode: "tanstack-start" });
		});
		expect(hook.result.current).toBe("tanstack-start");
	});
});
