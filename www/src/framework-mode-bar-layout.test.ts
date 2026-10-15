import { describe, expect, it } from "@effect/vitest";

import {
	FRAMEWORK_MODE_BAR_HIDE_GAP,
	FRAMEWORK_MODE_BAR_OVERLAY_INSET,
	FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL,
	frameworkModeBarLayout,
} from "./framework-mode-bar-layout.ts";

const base = {
	// Far enough below the sticky line that parallax progress is still 0.
	code: { bottom: 900, left: 640, top: 420, width: 560 },
	isLarge: true,
	pillHeight: 40,
	pillWidth: 220,
	principlesTop: 2000,
	reducedMotion: false,
	stickyTop: 64,
	viewportWidth: 1280,
} as const;

describe("frameworkModeBarLayout", () => {
	it("sits over the hero code and left of center at the top of the page", () => {
		const layout = frameworkModeBarLayout(base);
		expect(layout.y).toBe(base.code.top + FRAMEWORK_MODE_BAR_OVERLAY_INSET);
		expect(layout.x).toBe(base.code.left + base.code.width / 2);
		expect(layout.progress).toBe(0);
		expect(layout.visible).toBe(true);
	});

	it("drifts toward the viewport center as the code approaches the sticky line", () => {
		const mid = frameworkModeBarLayout({
			...base,
			code: {
				...base.code,
				// naturalY = stickyTop + travel/2 → progress 0.5
				top:
					base.stickyTop +
					FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL / 2 -
					FRAMEWORK_MODE_BAR_OVERLAY_INSET,
			},
		});
		const codeCenter = base.code.left + base.code.width / 2;
		const viewportCenter = base.viewportWidth / 2;
		expect(mid.progress).toBeCloseTo(0.5);
		expect(mid.x).toBeCloseTo((codeCenter + viewportCenter) / 2);
		expect(mid.y).toBeGreaterThan(base.stickyTop);
	});

	it("sticks under the header and centers once the code has scrolled past", () => {
		const stuck = frameworkModeBarLayout({
			...base,
			code: { ...base.code, top: 40 },
		});
		expect(stuck.progress).toBe(1);
		expect(stuck.y).toBe(base.stickyTop);
		expect(stuck.x).toBe(base.viewportWidth / 2);
	});

	it("stays over the code center on small viewports", () => {
		const mobile = frameworkModeBarLayout({
			...base,
			code: { bottom: 700, left: 16, top: 40, width: 360 },
			isLarge: false,
			viewportWidth: 390,
		});
		expect(mobile.x).toBe(16 + 360 / 2);
		expect(mobile.y).toBe(base.stickyTop);
	});

	it("hides before the principles section reaches the sticky band", () => {
		const hidden = frameworkModeBarLayout({
			...base,
			code: { ...base.code, top: 40 },
			principlesTop:
				base.stickyTop + base.pillHeight + FRAMEWORK_MODE_BAR_HIDE_GAP - 1,
		});
		expect(hidden.visible).toBe(false);
	});

	it("skips parallax when reduced motion is on", () => {
		const following = frameworkModeBarLayout({
			...base,
			code: {
				...base.code,
				top:
					base.stickyTop +
					FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL / 2 -
					FRAMEWORK_MODE_BAR_OVERLAY_INSET,
			},
			reducedMotion: true,
		});
		expect(following.x).toBe(base.code.left + base.code.width / 2);

		const stuck = frameworkModeBarLayout({
			...base,
			code: { ...base.code, top: 40 },
			reducedMotion: true,
		});
		expect(stuck.x).toBe(base.viewportWidth / 2);
	});
});
