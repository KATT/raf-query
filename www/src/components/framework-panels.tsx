import {
	type ReactNode,
	useDeferredValue,
	useState,
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
 * React names every boundary near a transition's changes to measure layout,
 * which starts a document view transition (and swallows clicks while it runs)
 * for unrelated updates such as the homepage demo. So the boundary is `"none"`
 * except in the one commit where the mode flips: `settled` catches up from
 * the ref once that commit lands.
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
	readonly mode: FrameworkMode;
}) {
	const mode = useDeferredValue(props.mode);
	const [settled, setSettled] = useState(mode);
	const hydrated = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	return (
		<ViewTransition default={mode === settled ? "none" : "framework-panels"}>
			<div
				data-framework-panels={hydrated ? mode : undefined}
				ref={(element) => {
					if (element) {
						syncFrameworkModeAttribute(mode);
						setSettled(mode);
					}
				}}
			>
				{props.children}
			</div>
		</ViewTransition>
	);
}
