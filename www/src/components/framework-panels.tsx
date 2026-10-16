import {
	type ReactNode,
	useDeferredValue,
	useSyncExternalStore,
	ViewTransition,
} from "react";

import {
	type FrameworkMode,
	syncFrameworkModeAttribute,
} from "~/framework-mode.ts";

/**
 * Cross-fades the homepage framework panels when the mode changes, with
 * `<ViewTransition>`'s default animation.
 *
 * The router publishes search through `useSyncExternalStore`, which React
 * commits synchronously, and view transitions only run for transition-lane
 * commits. Deferring the mode moves the switch into one.
 *
 * Which panel shows is still CSS on `html[data-framework-mode]` (see
 * `frameworkModeScript`). React only animates a boundary whose DOM it mutated
 * itself, so the wrapper also mirrors the mode — after hydration only, since
 * the prerendered HTML always carries the default mode. The `<html>`
 * attribute flips in the ref callback: refs attach inside the view
 * transition's update, after the old snapshot is taken.
 */
export function FrameworkPanels(props: {
	readonly children: ReactNode;
	readonly className?: string;
	readonly mode: FrameworkMode;
}) {
	const mode = useDeferredValue(props.mode);
	const hydrated = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	return (
		<ViewTransition default="framework-panels">
			<div
				className={props.className}
				data-framework-panels={hydrated ? mode : undefined}
				ref={(element) => {
					if (element) {
						syncFrameworkModeAttribute(mode);
					}
				}}
			>
				{props.children}
			</div>
		</ViewTransition>
	);
}
