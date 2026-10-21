import { Boundary } from "@raf-query/experimental-effect-query";
import { Cause } from "effect";
import { RpcClientError } from "effect/rpc";

import { Forbidden, Unauthorized } from "./api.ts";
import { client } from "./client.ts";

function Crashed(props: Boundary.RootFallbackProps) {
	return (
		<div role="alert">
			<pre>{Cause.pretty(props.cause)}</pre>
			<button onClick={props.retry}>Try again</button>
		</div>
	);
}

function Offline(props: Boundary.FallbackProps<RpcClientError.RpcClientError>) {
	return (
		<p>
			Can’t reach the server. <button onClick={props.retry}>Retry</button>
		</p>
	);
}

function SignIn(props: Boundary.FallbackProps<Unauthorized>) {
	return <button onClick={props.retry}>Sign in</button>;
}

function RequestAccess(props: Boundary.FallbackProps<Forbidden>) {
	return <p>You can’t open doc {props.error.docId}.</p>;
}

// #region chain
export const [App, useApp] = Boundary.root({
	name: "App",
	client,
	fallback: Crashed,
});

export const [Network, useNetwork] = Boundary.catchErrors(App, {
	name: "Network",
	errors: [RpcClientError.RpcClientError],
	fallback: Offline,
});

export const [Session, useSession] = Boundary.catchErrors(Network, {
	name: "Session",
	errors: [Unauthorized],
	fallback: SignIn,
});

export const [DocAccess, useDocAccess] = Boundary.catchErrors(Session, {
	name: "DocAccess",
	errors: [Forbidden],
	fallback: RequestAccess,
});
// #endregion
