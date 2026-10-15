import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import {
	type FrameworkMode,
	frameworkModeLabels,
	frameworkModeSearch,
	frameworkModes,
} from "~/framework-mode.ts";
import { frameworkModeBarLayout } from "~/framework-mode-bar-layout.ts";

const largeQuery = "(min-width: 1024px)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

type BarStyle = {
	readonly left: number | string;
	readonly opacity: number;
	readonly position: "absolute" | "fixed";
	readonly top: number;
	readonly visibility: "hidden" | "visible";
};

/** Docked above the code, centered — also the prerendered position. */
const dockedStyle: BarStyle = {
	left: "50%",
	opacity: 1,
	position: "absolute",
	top: 0,
	visibility: "visible",
};

const hiddenStyle: BarStyle = {
	...dockedStyle,
	opacity: 0,
	visibility: "hidden",
};

function sameStyle(a: BarStyle, b: BarStyle) {
	return (
		a.left === b.left &&
		a.opacity === b.opacity &&
		a.position === b.position &&
		a.top === b.top &&
		a.visibility === b.visibility
	);
}

/**
 * Docks (`absolute`) in the space reserved above the hero code block
 * (`#hero-code`, which must be its positioned parent), drifts toward the
 * viewport center as you scroll (desktop), snaps to `fixed` under the site
 * header, and hides before `#principles` — the examples stop being relevant
 * there.
 */
export function FrameworkModeBar(props: { readonly mode: FrameworkMode }) {
	const [style, setStyle] = useState<BarStyle>(dockedStyle);
	const [visible, setVisible] = useState(true);

	return (
		<div
			aria-hidden={visible ? undefined : true}
			className="pointer-events-none z-30 w-max -translate-x-1/2 transition-[opacity,visibility] duration-200"
			ref={(shell) => {
				if (shell === null) {
					return;
				}

				let frame = 0;

				const measure = () => {
					const code = document.getElementById("hero-code");
					const principles = document.getElementById("principles");
					const header = document.querySelector("header");
					if (!code || !principles || !header) {
						setVisible((prev) => (prev ? false : prev));
						setStyle((prev) =>
							sameStyle(prev, hiddenStyle) ? prev : hiddenStyle,
						);
						return;
					}

					const layout = frameworkModeBarLayout({
						code: code.getBoundingClientRect(),
						isLarge: window.matchMedia(largeQuery).matches,
						pillHeight: shell.offsetHeight,
						principlesTop: principles.getBoundingClientRect().top,
						reducedMotion: window.matchMedia(reducedMotionQuery).matches,
						scrollY: window.scrollY,
						stickyTop: header.getBoundingClientRect().bottom + 8,
						viewportWidth: window.innerWidth,
					});

					const next: BarStyle = {
						left: layout.left,
						opacity: layout.visible ? 1 : 0,
						position: layout.position,
						top: layout.top,
						visibility: layout.visible ? "visible" : "hidden",
					};
					// Bail when unchanged so a new inline ref callback does not loop.
					setVisible((prev) =>
						prev === layout.visible ? prev : layout.visible,
					);
					setStyle((prev) => (sameStyle(prev, next) ? prev : next));
				};

				const onScrollOrResize = () => {
					cancelAnimationFrame(frame);
					frame = requestAnimationFrame(measure);
				};

				measure();
				window.addEventListener("scroll", onScrollOrResize, { passive: true });
				window.addEventListener("resize", onScrollOrResize);
				const largeMq = window.matchMedia(largeQuery);
				const motionMq = window.matchMedia(reducedMotionQuery);
				largeMq.addEventListener("change", onScrollOrResize);
				motionMq.addEventListener("change", onScrollOrResize);

				return () => {
					cancelAnimationFrame(frame);
					window.removeEventListener("scroll", onScrollOrResize);
					window.removeEventListener("resize", onScrollOrResize);
					largeMq.removeEventListener("change", onScrollOrResize);
					motionMq.removeEventListener("change", onScrollOrResize);
				};
			}}
			style={style}
		>
			<div
				aria-label="Framework for homepage examples"
				className={cn(
					"pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/90 p-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/75",
					!visible && "pointer-events-none",
				)}
				inert={visible ? undefined : true}
				role="group"
			>
				{frameworkModes.map((mode) => {
					const active = mode === props.mode;
					return (
						<Link
							activeOptions={{ exact: true, includeSearch: true }}
							aria-current={active ? "true" : undefined}
							className={cn(
								"rounded-full px-3.5 py-1.5 text-sm transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
								active
									? "bg-foreground font-medium text-background"
									: "text-muted-foreground",
							)}
							key={mode}
							replace
							search={frameworkModeSearch(mode)}
							tabIndex={visible ? undefined : -1}
							to="/"
						>
							{frameworkModeLabels[mode]}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
