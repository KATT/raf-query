import { Boundary } from "@raf-query/experimental-effect-query";
import type { RpcClientError } from "effect/rpc";

import type { DocRpcs, Forbidden, Unauthorized } from "./api.ts";
import { client } from "./client.ts";
import { Crashed } from "./fallbacks.tsx";

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
export type AppError = Boundary.RpcErrors<typeof DocRpcs>;

export const [App, useApp, useAppResult] = Boundary.root({
	name: "App",
	client,
	errors: Boundary.errors<AppError>(),
	fallback: Crashed,
});

export const [Network, useNetwork, useNetworkResult] = Boundary.catchErrors(
	App,
	{ name: "Network", tags: ["RpcClientError"], fallback: Offline },
);

export const [Session, useSession, useSessionResult] = Boundary.catchErrors(
	Network,
	{ name: "Session", tags: ["Unauthorized"], fallback: SignIn },
);

export const [DocAccess, useDocAccess, useDocAccessResult] =
	Boundary.catchErrors(Session, {
		name: "DocAccess",
		tags: ["Forbidden"],
		fallback: RequestAccess,
	});
// #endregion
