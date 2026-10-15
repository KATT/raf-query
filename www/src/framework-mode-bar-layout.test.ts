import { describe, expect, it } from "@effect/vitest";

import {
	FRAMEWORK_MODE_BAR_HIDE_GAP,
	FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL,
	frameworkModeBarLayout,
} from "./framework-mode-bar-layout.ts";

const base = {
	// Far enough below the sticky line that parallax progress is still 0.
	code: { left: 640, top: 420, width: 560 },
	isLarge: true,
	pillHeight: 40,
	principlesTop: 2000,
	reducedMotion: false,
	scrollY: 0,
	stickyTop: 64,
	viewportWidth: 1280,
} as const;

const codeCenter = base.code.left + base.code.width / 2;
const viewportCenter = base.viewportWidth / 2;

/** `base` scrolled down by `by` pixels. */
function scrolled(by: number) {
	return {
		...base,
		code: { ...base.code, top: base.code.top - by },
		scrollY: by,
	};
}

describe("frameworkModeBarLayout", () => {
	it("docks above the hero code, centered on it, at the top of the page", () => {
		const layout = frameworkModeBarLayout(base);
		expect(layout.position).toBe("absolute");
		expect(layout.top).toBe(0);
		expect(layout.left).toBe(base.code.width / 2);
		expect(layout.progress).toBe(0);
		expect(layout.visible).toBe(true);
	});

	it("drifts toward the viewport center as the code approaches the sticky line", () => {
		const distance = base.code.top - base.stickyTop;
		const mid = frameworkModeBarLayout(
			scrolled(distance - FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL / 2),
		);
		expect(mid.position).toBe("absolute");
		expect(mid.top).toBe(0);
		expect(mid.progress).toBeCloseTo(0.5);
		expect(mid.left + base.code.left).toBeCloseTo(
			(codeCenter + viewportCenter) / 2,
		);
	});

	it("spreads the drift over the whole scroll when the hero starts close to the header", () => {
		const close = { ...base, code: { ...base.code, top: 152 } };
		expect(frameworkModeBarLayout(close).progress).toBe(0);
		expect(frameworkModeBarLayout(close).left).toBe(base.code.width / 2);

		const half = frameworkModeBarLayout({
			...close,
			code: { ...close.code, top: 108 },
			scrollY: 44,
		});
		expect(half.progress).toBeCloseTo(0.5);
	});

	it("snaps to fixed under the header, centered, once the dock reaches the sticky line", () => {
		const atLine = frameworkModeBarLayout(
			scrolled(base.code.top - base.stickyTop),
		);
		expect(atLine.position).toBe("fixed");
		expect(atLine.top).toBe(base.stickyTop);
		expect(atLine.left).toBe(viewportCenter);
		expect(atLine.progress).toBe(1);

		const past = frameworkModeBarLayout(scrolled(1000));
		expect(past.position).toBe("fixed");
		expect(past.top).toBe(base.stickyTop);
		expect(past.left).toBe(viewportCenter);
		expect(past.visible).toBe(true);
	});

	it("lands where it was: the last docked frame is next to the stuck spot", () => {
		const distance = base.code.top - base.stickyTop;
		const before = frameworkModeBarLayout(scrolled(distance - 1));
		const after = frameworkModeBarLayout(scrolled(distance));
		expect(before.position).toBe("absolute");
		expect(after.position).toBe("fixed");
		const beforeViewportTop = base.code.top - (distance - 1) + before.top;
		expect(beforeViewportTop - after.top).toBe(1);
		expect(Math.abs(before.left + base.code.left - after.left)).toBeLessThan(2);
	});

	it("stays on the code center on small viewports, docked and stuck", () => {
		const mobile = {
			...base,
			code: { left: 16, top: 900, width: 358 },
			isLarge: false,
			viewportWidth: 390,
		};
		const docked = frameworkModeBarLayout(mobile);
		expect(docked.position).toBe("absolute");
		expect(docked.left).toBe(358 / 2);

		const stuck = frameworkModeBarLayout({
			...mobile,
			code: { ...mobile.code, top: 40 },
			scrollY: 860,
		});
		expect(stuck.position).toBe("fixed");
		expect(stuck.left).toBe(16 + 358 / 2);
		expect(stuck.top).toBe(base.stickyTop);
	});

	it("hides before the principles section reaches the sticky band", () => {
		const hidden = frameworkModeBarLayout({
			...scrolled(1000),
			principlesTop:
				base.stickyTop + base.pillHeight + FRAMEWORK_MODE_BAR_HIDE_GAP - 1,
		});
		expect(hidden.position).toBe("fixed");
		expect(hidden.visible).toBe(false);
	});

	it("skips parallax when reduced motion is on", () => {
		const distance = base.code.top - base.stickyTop;
		const docked = frameworkModeBarLayout({
			...scrolled(distance - FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL / 2),
			reducedMotion: true,
		});
		expect(docked.left).toBe(base.code.width / 2);

		const stuck = frameworkModeBarLayout({
			...scrolled(1000),
			reducedMotion: true,
		});
		expect(stuck.left).toBe(viewportCenter);
	});
});
