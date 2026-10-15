/** Inset from the hero code block's top edge while the pill rides with it. */
export const FRAMEWORK_MODE_BAR_OVERLAY_INSET = 12;

/** Vertical gap below the sticky top before the pill fades out for `#principles`. */
export const FRAMEWORK_MODE_BAR_HIDE_GAP = 32;

/**
 * How many pixels of travel (code top approaching the sticky line) map to a
 * full left→center parallax. Shorter = snappier drift.
 */
export const FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL = 280;

export type FrameworkModeBarLayoutInput = {
	readonly code: {
		readonly bottom: number;
		readonly left: number;
		readonly top: number;
		readonly width: number;
	};
	readonly isLarge: boolean;
	readonly pillHeight: number;
	readonly pillWidth: number;
	readonly principlesTop: number;
	readonly reducedMotion: boolean;
	readonly stickyTop: number;
	readonly viewportWidth: number;
};

export type FrameworkModeBarLayout = {
	/** 0 over the code, 1 fully drifted to the viewport center / stuck. */
	readonly progress: number;
	readonly visible: boolean;
	/** Viewport X of the pill's center. */
	readonly x: number;
	/** Viewport Y of the pill's top edge. */
	readonly y: number;
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number) {
	return from + (to - from) * t;
}

/**
 * Where the homepage framework pill sits for a given scroll / layout snapshot.
 * Pure so tests can pin the parallax and hide rules without a browser.
 */
export function frameworkModeBarLayout(
	input: FrameworkModeBarLayoutInput,
): FrameworkModeBarLayout {
	const naturalY = input.code.top + FRAMEWORK_MODE_BAR_OVERLAY_INSET;
	const y = Math.max(input.stickyTop, naturalY);
	const stuck = naturalY <= input.stickyTop;
	const progress = stuck
		? 1
		: clamp(
				1 - (naturalY - input.stickyTop) / FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL,
				0,
				1,
			);

	const codeCenterX = input.code.left + input.code.width / 2;
	const viewportCenterX = input.viewportWidth / 2;

	let x: number;
	if (!input.isLarge) {
		// Mobile: stay over the code (full-width ≈ viewport center) the whole time.
		x = codeCenterX;
	} else if (input.reducedMotion) {
		x = stuck ? viewportCenterX : codeCenterX;
	} else {
		x = lerp(codeCenterX, viewportCenterX, progress);
	}

	const visible =
		input.principlesTop >
		input.stickyTop + input.pillHeight + FRAMEWORK_MODE_BAR_HIDE_GAP;

	return { progress, visible, x, y };
}
