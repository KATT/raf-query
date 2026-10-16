import { type ReactNode, ViewTransition } from "react";

/**
 * Wraps a Suspense fallback so it fades out over the content when that
 * reveals. Reveals commit in React's retry lanes, which run view transitions.
 * Only the exit animates: with any other class React would also name the
 * skeleton for unrelated transitions nearby.
 */
export function FallbackFade(props: { readonly children: ReactNode }) {
	return (
		<ViewTransition default="none" exit="auto">
			{props.children}
		</ViewTransition>
	);
}
