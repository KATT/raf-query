/**
 * The boundary chain, from the outside in. Each is a pair: the Provider to
 * mount, and the hook that reads through it. Each takes its errors off the
 * type of its hook, and of the hooks of the boundaries inside it.
 *
 * - `App` mounts the client and catches defects (and interrupts).
 * - `Network` catches the transport's `RpcClientError`.
 * - `Session` catches the session middleware's `Unauthorized`.
 * - `DocAccess` catches `Forbidden`, around one document.
 *
 * `DocNotFound` and `EmptyTitle` are left to the components.
 */
import { Button } from "@examples/ui/components/button";
import { Boundary } from "@raf-query/experimental-effect-query";
import { Cause, Predicate } from "effect";
import { RpcClientError } from "effect/rpc";

import { Forbidden, Unauthorized } from "./api.ts";
import { setChaos, toggle, getChaos } from "./chaos.ts";
import { client } from "./client.ts";
import { Caught } from "./frame.tsx";
import { log } from "./log.ts";

/** What the event log says a boundary caught: the error's tag, or what kind of crash. */
const describe = (caught: Boundary.Caught) => {
	if (Predicate.hasProperty(caught.error, "_tag")) {
		// oxlint-disable-next-line eslint/no-underscore-dangle -- the errors boundaries catch are tagged
		return String(caught.error._tag);
	}
	return Cause.hasDies(caught.cause) ? "a defect" : "an interrupt";
};

const Crashed = (props: Boundary.RootFallbackProps) => {
	const what = Cause.hasDies(props.cause) ? "a defect" : "an interrupt";
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

export const [App] = Boundary.root({
	client,
	fallback: Crashed,
	name: "App",
	onCaught: (caught) => {
		log({ by: caught.name, root: caught.root, what: describe(caught) });
	},
});

export const [Network] = Boundary.catchErrors(App, {
	errors: [RpcClientError.RpcClientError],
	fallback: Offline,
	name: "Network",
});

export const [Session, useSession] = Boundary.catchErrors(Network, {
	errors: [Unauthorized],
	fallback: SignIn,
	name: "Session",
});

export const [DocAccess, useDocAccess] = Boundary.catchErrors(Session, {
	errors: [Forbidden],
	fallback: RequestAccess,
	name: "DocAccess",
});
