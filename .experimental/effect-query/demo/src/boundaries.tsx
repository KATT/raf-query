/**
 * The boundary chain, from the outside in. Each is a triple: the Provider to
 * mount, a hook that reads the data, and one that reads a `Result`. Each
 * catches errors by `_tag`, and takes them off the types of its hooks and of
 * the hooks of the boundaries inside it.
 *
 * - `App` mounts the client, declares what its queries can fail with, and
 *   catches defects, interrupts and failures nothing else catches.
 * - `Network` catches the transport's `RpcClientError`.
 * - `Session` catches the session middleware's `Unauthorized`.
 * - `DocAccess` catches `Forbidden`, around one document.
 *
 * `DocNotFound` and `EmptyTitle` are left to the components. The errors are
 * only types here: this module imports none of `api.ts`'s classes.
 */
import { Button } from "@examples/ui/components/button";
import { Boundary } from "@raf-query/experimental-effect-query";
import { Cause } from "effect";
import type { RpcClientError } from "effect/rpc";

import type { DocRpcs, Forbidden, Unauthorized } from "./api.ts";
import { setChaos, toggle, getChaos } from "./chaos.ts";
import { client } from "./client.ts";
import { Caught } from "./frame.tsx";

/** Everything a call of the docs RPC client can fail with. */
export type AppError = Boundary.RpcErrors<typeof DocRpcs>;

const whatCrashed = (cause: Cause.Cause<unknown>) => {
	if (Cause.hasFails(cause)) {
		return "a failure nothing caught";
	}
	return Cause.hasDies(cause) ? "a defect" : "an interrupt";
};

const Crashed = (props: Boundary.RootFallbackProps) => {
	const what = whatCrashed(props.cause);
	return (
		<Caught
			actions={
				<Button
					onClick={() => {
						setChaos({ serverBug: false });
						props.retry();
					}}
				>
					Fix the server and retry
				</Button>
			}
			name="App"
			tone="root"
			what={what}
		>
			<p className="text-sm">
				{Cause.hasFails(props.cause)
					? "No boundary in the chain catches this error’s tag, and the component read through a data hook, so it came here."
					: "No typed boundary can catch a defect: it isn’t in any error type. It skipped every boundary on the way up."}
			</p>
			<pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
				{Cause.pretty(props.cause)}
			</pre>
		</Caught>
	);
};

const Offline = (
	props: Boundary.FallbackProps<RpcClientError.RpcClientError>,
) => {
	return (
		<Caught
			actions={
				<Button
					onClick={() => {
						setChaos({ offline: false });
						props.retry();
					}}
				>
					Reconnect
				</Button>
			}
			name="Network"
			tone="network"
			what="RpcClientError"
		>
			<p className="text-sm">Can’t reach the server: {props.error.message}</p>
		</Caught>
	);
};

const SignIn = (props: Boundary.FallbackProps<Unauthorized>) => {
	return (
		<Caught
			actions={
				<Button
					onClick={() => {
						setChaos({ signedIn: true });
						props.retry();
					}}
				>
					Sign in
				</Button>
			}
			name="Session"
			tone="session"
			what="Unauthorized"
		>
			<p className="text-sm">
				Your session ended. Every query under here needs one.
			</p>
		</Caught>
	);
};

const RequestAccess = (props: Boundary.FallbackProps<Forbidden>) => {
	return (
		<Caught
			actions={
				<Button
					onClick={() => {
						setChaos({ locked: toggle(getChaos().locked, props.error.docId) });
						props.retry();
					}}
				>
					Grant access
				</Button>
			}
			name="DocAccess"
			tone="access"
			what="Forbidden"
		>
			<p className="text-sm">
				You don’t have access to doc {props.error.docId}.
			</p>
		</Caught>
	);
};

export const [App] = Boundary.root({
	client,
	errors: Boundary.errors<AppError>(),
	fallback: Crashed,
	name: "App",
});

export const [Network] = Boundary.catchErrors(App, {
	fallback: Offline,
	name: "Network",
	tags: ["RpcClientError"],
});

export const [Session, useSession, useSessionResult] = Boundary.catchErrors(
	Network,
	{ fallback: SignIn, name: "Session", tags: ["Unauthorized"] },
);

export const [DocAccess, useDocAccess, useDocAccessResult] =
	Boundary.catchErrors(Session, {
		fallback: RequestAccess,
		name: "DocAccess",
		tags: ["Forbidden"],
	});
