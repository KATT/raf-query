/**
 * Most pixels of scroll (code top approaching the sticky line) that map to a
 * full code-center → viewport-center parallax. Shorter = snappier drift.
 */
export const FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL = 280;

export type FrameworkModeBarLayoutInput = {
	/**
	 * Viewport rect of `#hero-code`. The pill docks at its top edge, in the
	 * padding reserved above the code.
	 */
	readonly code: {
		readonly left: number;
		readonly top: number;
		readonly width: number;
	};
	readonly isLarge: boolean;
	readonly principlesTop: number;
	readonly reducedMotion: boolean;
	readonly scrollY: number;
	readonly stickyTop: number;
	readonly viewportHeight: number;
	readonly viewportWidth: number;
};

export type FrameworkModeBarLayout = {
	/**
	 * Pill center X, in the containing block's coordinates: `#hero-code`'s
	 * box while `absolute`, the viewport while `fixed`.
	 */
	readonly left: number;
	readonly position: "absolute" | "fixed";
	/** 0 centered on the code, 1 fully drifted to the viewport center / stuck. */
	readonly progress: number;
	/** Pill top edge, in the same coordinates as `left`. */
	readonly top: number;
	readonly visible: boolean;
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number) {
	return from + (to - from) * t;
}

/**
 * Where the homepage framework pill sits for a given scroll / layout snapshot.
 * Docked (`absolute`) above the hero code until that spot would scroll under
 * the header, then stuck (`fixed`) at `stickyTop`. Pure so tests can pin the
 * snap, parallax and hide rules without a browser.
 */
export function frameworkModeBarLayout(
	input: FrameworkModeBarLayoutInput,
): FrameworkModeBarLayout {
	const distance = input.code.top - input.stickyTop;
	const stuck = distance <= 0;
	// Never longer than the distance at the top of the page, so the pill
	// starts on the code center even when the hero sits close to the header.
	const travel = Math.max(
		1,
		Math.min(FRAMEWORK_MODE_BAR_PARALLAX_TRAVEL, distance + input.scrollY),
	);
	const progress = stuck ? 1 : clamp(1 - distance / travel, 0, 1);

	const codeCenterX = input.code.left + input.code.width / 2;
	const viewportCenterX = input.viewportWidth / 2;

	let x: number;
	if (!input.isLarge) {
		x = codeCenterX;
	} else if (input.reducedMotion) {
		x = stuck ? viewportCenterX : codeCenterX;
	} else {
		x = lerp(codeCenterX, viewportCenterX, progress);
	}

	// Gone once `#principles` enters the viewport — the samples stop mattering
	// there, so the pill should not still be stuck under the header.
	const visible = input.principlesTop >= input.viewportHeight;

	return stuck
		? { left: x, position: "fixed", progress, top: input.stickyTop, visible }
		: {
				left: x - input.code.left,
				position: "absolute",
				progress,
				top: 0,
				visible,
			};
}
