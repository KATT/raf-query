/**
 * The boundary chain, from the outside in. Each boundary is a pair: the
 * Provider to mount, and the hook that reads through it. Each catches errors
 * by `_tag`, and takes them off the type of its hook and of the hooks of the
 * boundaries inside it; what's left comes back as an `Unhandled`.
 *
 * - `App` mounts the client, declares what its queries can fail with, and
 *   catches defects and interrupts.
 * - `Network` catches the transport's `RpcClientError`.
 * - `Session` catches the session middleware's `Unauthorized`.
 * - `DocAccess` catches `Forbidden`, around one document.
 *
 * The type switches change which tags each boundary catches, so the chain is
 * made for each combination, with its types erased: the code panel shows
 * what the compiler says about it. The errors are only types here: this
 * module imports none of `api.ts`'s classes.
 */
import { Button } from "@examples/ui/components/button";
import {
	Boundary,
	type Mutation,
	type Query,
} from "@raf-query/experimental-effect-query";
import { Cause, Match, Predicate } from "effect";
import type { ReactNode } from "react";

import type { DocRpcs } from "./api.ts";
import { getChaos, setChaos, toggle } from "./chaos.ts";
import { client } from "./client.ts";
import { type Config, layoutOf, type Name, type Tag } from "./configs.ts";
import { Caught, type Tone } from "./frame.tsx";
import { log } from "./log.ts";

/** Everything a call of the docs RPC client can fail with. */
export type AppError = Boundary.RpcErrors<typeof DocRpcs>;

const whatCrashed = (cause: Cause.Cause<unknown>) => {
	if (Cause.hasFails(cause)) {
		return "the client’s layer failed";
	}
	return Cause.hasDies(cause) ? "a defect" : "an interrupt";
};

/** What the event log says a boundary caught: the error's tag, or what kind of crash. */
const describe = (caught: Boundary.Caught) => {
	if (Predicate.hasProperty(caught.error, "_tag")) {
		// oxlint-disable-next-line eslint/no-underscore-dangle -- the errors boundaries catch are tagged
		return String(caught.error._tag);
	}
	return whatCrashed(caught.cause);
};

const Crashed = (props: Boundary.RootFallbackProps) => (
	<Caught
		actions={
			<Button
				onClick={() => {
					setChaos({ serverBug: false });
					props.retry();
				}}
			>
				{getChaos().serverBug ? "Fix the server and retry" : "Retry"}
			</Button>
		}
		name="App"
		tone="root"
		what={whatCrashed(props.cause)}
	>
		<p className="text-sm">
			{Cause.hasFails(props.cause)
				? "The client’s services couldn’t be built, so nothing under App can run."
				: "No typed boundary can catch a defect: it isn’t in any error type. It skipped every boundary on the way up. A server bug is one; so is reading the data off an Unhandled, which the compiler rejects."}
		</p>
		<pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
			{Cause.pretty(props.cause)}
		</pre>
	</Caught>
);

type Fallback = (props: Boundary.FallbackProps<AppError>) => ReactNode;

/** What a fallback says about an error, and the button that fixes its cause. */
const fixFor = (error: AppError) =>
	Match.valueTags(error, {
		DocNotFound: (gone) => ({
			action: "Restore it",
			fix: () => {
				if (getChaos().deleted.has(gone.docId)) {
					setChaos({ deleted: toggle(getChaos().deleted, gone.docId) });
				}
			},
			text: `Doc ${gone.docId} doesn’t exist.`,
		}),
		EmptyTitle: () => ({
			action: "Retry",
			fix: () => {},
			text: "A title can’t be empty.",
		}),
		Forbidden: (forbidden) => ({
			action: "Grant access",
			fix: () => {
				setChaos({ locked: toggle(getChaos().locked, forbidden.docId) });
			},
			text: `You don’t have access to doc ${forbidden.docId}.`,
		}),
		RpcClientError: () => ({
			action: "Reconnect",
			fix: () => setChaos({ offline: false }),
			text: "Can’t reach the server.",
		}),
		Unauthorized: () => ({
			action: "Sign in",
			fix: () => setChaos({ signedIn: true }),
			text: "Your session ended. Every query under here needs one.",
		}),
	});

/** Any boundary's fallback: the switches decide which tags reach it. */
const fallbackFor = (name: Exclude<Name, "App">, tone: Tone): Fallback =>
	function Fallback(props) {
		const fix = fixFor(props.error);
		return (
			<Caught
				actions={
					<Button
						onClick={() => {
							fix.fix();
							props.retry();
						}}
					>
						{fix.action}
					</Button>
				}
				name={name}
				tone={tone}
				// oxlint-disable-next-line eslint/no-underscore-dangle -- the errors boundaries catch are tagged
				what={props.error._tag}
			>
				<p className="text-sm">{fix.text}</p>
			</Caught>
		);
	};

const fallbacks = {
	DocAccess: fallbackFor("DocAccess", "access"),
	Network: fallbackFor("Network", "network"),
	Session: fallbackFor("Session", "session"),
} satisfies Record<Exclude<Name, "App">, Fallback>;

const [App, useApp] = Boundary.root({
	client,
	errors: Boundary.errors<AppError>(),
	fallback: Crashed,
	name: "App",
	onCaught: (caught) => {
		log({ by: caught.name, root: caught.root, what: describe(caught) });
	},
});

export type Services = Boundary.ServicesOf<typeof App>;

/** A boundary of the running chain, with its types erased. */
export interface Link {
	readonly name: Name;
	readonly Provider: Boundary.AnyBoundary;
	readonly tags: ReadonlyArray<Tag>;
	readonly useRead: <A>(
		query: Query.Query<A, AppError, Services>,
	) => A | Boundary.Unhandled<AppError>;
}

type Erased = readonly [Boundary.AnyBoundary, Link["useRead"]];

// SAFETY: the switches make reads the compiler rejects, and the code panel shows what it says; at runtime the hook is type-erased.
const useAppErased = useApp as unknown as Link["useRead"];

const root: Link = {
	name: "App",
	Provider: App,
	tags: [],
	useRead: useAppErased,
};

// SAFETY: the switches make chains the compiler rejects, and the code panel shows what it says; at runtime `catchErrors` only reads `tags`.
const catchErased = Boundary.catchErrors as unknown as (
	parent: Boundary.AnyBoundary,
	options: {
		readonly fallback: Fallback;
		readonly name: string;
		readonly tags: ReadonlyArray<Tag>;
	},
) => Erased;

/** The running chain for a combination of the switches: its boundaries, and the ones the components read through. */
export interface Chain {
	/** The boundaries below the root, from the outside in. */
	readonly links: ReadonlyArray<Link>;
	readonly list: Link;
	readonly page: Link;
	readonly root: Link;
}

const links = new Map<string, Link>();

/**
 * Made once per chain from the root down to it, so a boundary stays the
 * same component while the switches that don't move it change. `path` is
 * that chain: a boundary's parent must be the one it was made from.
 */
const linkOf = (
	path: string,
	parent: Link,
	name: Exclude<Name, "App">,
	tags: ReadonlyArray<Tag>,
) => {
	const key = `${path}>${name}/${tags.join()}`;
	const existing = links.get(key);
	if (existing !== undefined) {
		return existing;
	}
	const [Provider, useRead] = catchErased(parent.Provider, {
		fallback: fallbacks[name],
		name,
		tags,
	});
	const link: Link = { name, Provider, tags, useRead };
	links.set(key, link);
	return link;
};

export const chainOf = (config: Config): Chain => {
	const layout = layoutOf(config);
	const made = new Map<Name, Link>([["App", root]]);
	let path = "App";
	for (const link of layout.links) {
		const parent = made.get(link.parent) ?? root;
		made.set(link.name, linkOf(path, parent, link.name, link.tags));
		path = `${path}>${link.name}/${link.tags.join()}`;
	}
	return {
		links: layout.links.map((link) => made.get(link.name) ?? root),
		list: made.get(layout.list) ?? root,
		page: made.get(layout.page) ?? root,
		root,
	};
};

// SAFETY: as `catchErased`: the mutation's types were erased with the chain's.
export const useRunErased = Boundary.useRun as unknown as (
	boundary: Boundary.AnyBoundary,
) => <A>(
	mutation: Mutation.Mutation<A, AppError, Services>,
) => Promise<A | Boundary.Unhandled<AppError>>;
