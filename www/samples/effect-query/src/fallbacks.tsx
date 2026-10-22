import type { Boundary } from "@raf-query/experimental-effect-query";
import { Cause } from "effect";

export function Crashed(props: Boundary.RootFallbackProps) {
	return (
		<div role="alert">
			<pre>{Cause.pretty(props.cause)}</pre>
			<button onClick={props.retry}>Try again</button>
		</div>
	);
}

/** A fallback for any boundary: says what it caught. */
export function Caught(props: Boundary.FallbackProps<unknown>) {
	return (
		<p role="alert">
			{String(props.error)} <button onClick={props.retry}>Retry</button>
		</p>
	);
}
