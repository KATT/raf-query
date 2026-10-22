import { Button } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { useQueryClient } from "@raf-query/react";
import type { Boundary } from "@raf-query/react/boundary";
import { Cause, Match } from "effect";
import type { RpcClientError } from "effect/rpc";
import type { ReactNode } from "react";

import type { DocNotFound, Forbidden, Unauthorized } from "./api.ts";
import { getChaos, setChaos, toggle } from "./chaos.ts";
import { type Failure, logCaught } from "./log.ts";
import { docListQuery } from "./queries.ts";

export type Tone =
	| "access"
	| "exists"
	| "inline"
	| "network"
	| "root"
	| "session";

export const tones = {
	access: "border-sky-500/60 text-sky-700 dark:text-sky-300",
	exists: "border-rose-500/60 text-rose-700 dark:text-rose-300",
	inline: "border-emerald-500/60 text-emerald-700 dark:text-emerald-300",
	network: "border-amber-500/60 text-amber-700 dark:text-amber-300",
	root: "border-zinc-400/70 text-zinc-600 dark:text-zinc-300",
	session: "border-violet-500/60 text-violet-700 dark:text-violet-300",
} satisfies { readonly [K in Tone]: string };

/** A boundary's outline while its children render. */
export function Outline(props: {
	readonly catches: string;
	readonly children: ReactNode;
	readonly name: string;
	readonly tone: Tone;
}) {
	return (
		<section
			className={cn(
				"relative rounded-lg border-2 border-dashed px-2.5 pt-6 pb-2.5",
				tones[props.tone],
			)}
		>
			<span className="absolute top-1.5 left-2.5 font-mono text-[11px] leading-none">
				<strong>{props.name}</strong> catches {props.catches}
			</span>
			<div className="text-foreground">{props.children}</div>
		</section>
	);
}

/** A fallback: the outline turns solid and says what it caught. */
function CaughtBox(props: {
	readonly action?: ReactNode;
	readonly children: ReactNode;
	readonly failure: Failure;
	readonly name: string;
	readonly tone: Tone;
	readonly what: string;
}) {
	return (
		<section
			className={cn(
				"relative grid gap-2 rounded-lg border-2 bg-destructive/5 px-3 pt-6 pb-3",
				tones[props.tone],
			)}
			// A ref runs once the fallback is on screen; a render can be discarded.
			ref={() => {
				logCaught(props.failure, props.name, props.what);
			}}
			role="alert"
		>
			<span className="absolute top-1.5 left-3 font-mono text-[11px] leading-none">
				<strong>{props.name}</strong> caught <strong>{props.what}</strong>
			</span>
			<div className="grid justify-items-start gap-2 text-sm text-foreground">
				{props.children}
				{props.action}
			</div>
		</section>
	);
}

function Fix(props: {
	readonly children: string;
	readonly onClick: () => void;
}) {
	return (
		<Button onClick={props.onClick} size="xs">
			{props.children}
		</Button>
	);
}

export function Crashed(props: Boundary.RootFallbackProps) {
	const what = Cause.hasDies(props.cause) ? "a defect" : "an interrupt";
	return (
		<CaughtBox
			action={
				<Fix
					onClick={() => {
						setChaos({ serverBug: false });
						props.retry();
					}}
				>
					Fix the server and retry
				</Fix>
			}
			failure={props.cause}
			name="App"
			tone="root"
			what={what}
		>
			<p>
				A defect isn&apos;t in any error type, so it skipped every typed
				boundary.
			</p>
			<pre className="max-w-full overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
				{Cause.pretty(props.cause).split("\n")[0]}
			</pre>
		</CaughtBox>
	);
}

export function Offline(
	props: Boundary.FallbackProps<RpcClientError.RpcClientError>,
) {
	return (
		<CaughtBox
			action={
				<Fix
					onClick={() => {
						setChaos({ offline: false });
						props.retry();
					}}
				>
					Reconnect
				</Fix>
			}
			failure={props.error}
			name="Network"
			tone="network"
			what="RpcClientError"
		>
			<p>Can&apos;t reach the server.</p>
		</CaughtBox>
	);
}

function signInAndRetry(retry: () => void) {
	return () => {
		setChaos({ signedIn: true });
		retry();
	};
}

export function SignIn(props: Boundary.FallbackProps<Unauthorized>) {
	return (
		<CaughtBox
			action={<Fix onClick={signInAndRetry(props.retry)}>Sign in</Fix>}
			failure={props.error}
			name="Session"
			tone="session"
			what="Unauthorized"
		>
			<p>Your session ended. Every query in here needs one.</p>
		</CaughtBox>
	);
}

function grantAndRetry(docId: number, retry: () => void) {
	return () => {
		setChaos({ locked: toggle(getChaos().locked, docId) });
		retry();
	};
}

export function RequestAccess(props: Boundary.FallbackProps<Forbidden>) {
	return (
		<CaughtBox
			action={
				<Fix onClick={grantAndRetry(props.error.docId, props.retry)}>
					Grant access
				</Fix>
			}
			failure={props.error}
			name="DocAccess"
			tone="access"
			what="Forbidden"
		>
			<p>You don&apos;t have access to doc {props.error.docId}.</p>
		</CaughtBox>
	);
}

/** DocAccess's fallback when it catches `Unauthorized` too. */
export function RequestAccessOrSignIn(
	props: Boundary.FallbackProps<Forbidden | Unauthorized>,
) {
	const shown = Match.valueTags(props.error, {
		Forbidden: (forbidden) => ({
			fix: "Grant access",
			onClick: grantAndRetry(forbidden.docId, props.retry),
			text: `You don’t have access to doc ${forbidden.docId}.`,
			what: "Forbidden",
		}),
		Unauthorized: () => ({
			fix: "Sign in",
			onClick: signInAndRetry(props.retry),
			text: "Your session ended. DocAccess catches Unauthorized too, so only the doc went.",
			what: "Unauthorized",
		}),
	});
	return (
		<CaughtBox
			action={<Fix onClick={shown.onClick}>{shown.fix}</Fix>}
			failure={props.error}
			name="DocAccess"
			tone="access"
			what={shown.what}
		>
			<p>{shown.text}</p>
		</CaughtBox>
	);
}

export function Restore(props: Boundary.FallbackProps<DocNotFound>) {
	const client = useQueryClient();
	const docId = props.error.docId;
	return (
		<CaughtBox
			action={
				getChaos().deleted.has(docId) ? (
					<Fix
						onClick={() => {
							setChaos({ deleted: toggle(getChaos().deleted, docId) });
							props.retry();
							// The list loaded without it, and is on screen: it refetches, not retries.
							void client.invalidate(docListQuery);
						}}
					>
						Restore it
					</Fix>
				) : undefined
			}
			failure={props.error}
			name="DocExists"
			tone="exists"
			what="DocNotFound"
		>
			<p>Doc {docId} doesn&apos;t exist.</p>
		</CaughtBox>
	);
}
