import { describe, expect, it } from "@effect/vitest";

import {
	applyFrameworkMode,
	defaultFrameworkMode,
	frameworkModeAttribute,
	frameworkModeScript,
	frameworkModeSearch,
	homeSearchDefaults,
	homeSearchSchema,
	parseFrameworkMode,
} from "./framework-mode.ts";

describe("framework mode", () => {
	it("defaults to TanStack Start when the URL omits mode", () => {
		expect(homeSearchSchema.parse({})).toEqual(homeSearchDefaults);
		expect(parseFrameworkMode(undefined)).toBe("tanstack-start");
	});

	it("accepts nextjs from the search string", () => {
		expect(homeSearchSchema.parse({ mode: "nextjs" })).toEqual({
			mode: "nextjs",
		});
		expect(parseFrameworkMode("nextjs")).toBe("nextjs");
	});

	it("drops the default from the URL", () => {
		expect(homeSearchDefaults).toEqual({ mode: defaultFrameworkMode });
		expect(frameworkModeSearch("tanstack-start")).toEqual({});
		expect(frameworkModeSearch("nextjs")).toEqual({ mode: "nextjs" });
	});

	it("ships a before-paint script that applies the mode from ?mode=", () => {
		expect(frameworkModeScript).toContain("data-framework-panel");
		expect(frameworkModeScript).toContain(frameworkModeAttribute);
		expect(frameworkModeScript).toContain("nextjs");
		expect(frameworkModeScript).toContain(defaultFrameworkMode);
	});

	it("moves shared step ids onto the visible panel", () => {
		document.body.innerHTML = `
			<div data-framework-panel="tanstack-start">
				<li data-step-id="start-in-the-loader" id="start-in-the-loader"></li>
			</div>
			<div data-framework-panel="nextjs">
				<li data-step-id="start-in-the-loader"></li>
			</div>
		`;
		applyFrameworkMode("nextjs");
		expect(document.documentElement.getAttribute(frameworkModeAttribute)).toBe(
			"nextjs",
		);
		const panels = document.querySelectorAll("[data-framework-panel]");
		expect(panels[0]?.querySelector("[data-step-id]")?.id).toBe("");
		expect(panels[1]?.querySelector("[data-step-id]")?.id).toBe(
			"start-in-the-loader",
		);
		applyFrameworkMode("tanstack-start");
		expect(panels[0]?.querySelector("[data-step-id]")?.id).toBe(
			"start-in-the-loader",
		);
		expect(panels[1]?.querySelector("[data-step-id]")?.id).toBe("");
	});
});
