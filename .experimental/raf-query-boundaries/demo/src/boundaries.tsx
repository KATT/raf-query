/**
 * The boundary chain, from the outside in. Each is a pair: the Provider to
 * mount, and the hook that reads through it. Each takes its errors off the
 * type of its hook, and of the hooks of the boundaries inside it.
 *
 * Errors are named by tag and checked against `AppError`, a type: this module
 * imports the contract with `import type` only. (The client imports it at
 * runtime, to build the RPC client from the group.)
 *
 * - `App` mounts the client and catches defects (and interrupts).
 * - `Network` catches the transport's `RpcClientError`.
 * - `Session` catches the session middleware's `Unauthorized`.
 * - `DocAccess` catches `Forbidden`, around one document.
 *
 * `DocNotFound` and `EmptyTitle` are left to the components.
 */
import { Button } from "@examples/ui/components/button";
import { Boundary } from "@raf-query/react/boundary";
import { Cause } from "effect";
import type { RpcClientError } from "effect/rpc";

import type { DocRpcs, Forbidden, Unauthorized } from "./api.ts";
import { getChaos, setChaos, toggle } from "./chaos.ts";
import { client } from "./client.ts";
import { Caught } from "./frame.tsx";

const Crashed = (props: Boundary.RootFallbackProps) => {
	const what = Cause.hasDies(props.cause)
		? "a defect"
		: Cause.hasInterrupts(props.cause)
			? "an interrupt"
			: "a failure with no typed error";
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
				No typed boundary can catch a defect: it isn’t in any error type. It
				skipped every boundary on the way up.
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

/** Everything a `DocsClient` call can fail with. */
export type AppError = Boundary.RpcErrors<typeof DocRpcs>;

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

export const [Session, useSession] = Boundary.catchErrors(Network, {
	fallback: SignIn,
	name: "Session",
	tags: ["Unauthorized"],
});

export const [DocAccess, useDocAccess] = Boundary.catchErrors(Session, {
	fallback: RequestAccess,
	name: "DocAccess",
	tags: ["Forbidden"],
});
