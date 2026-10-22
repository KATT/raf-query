import { Button } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { type QueryHandle, useQueryClient } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Match } from "effect";
import type { ComponentType, ReactNode } from "react";

import type { Doc, DocRpcs, Unauthorized } from "./api.ts";
import { setChaos } from "./chaos.ts";
import type { DocsClient } from "./client.ts";
import {
	Crashed,
	Offline,
	RequestAccess,
	RequestAccessOrSignIn,
	Restore,
	SignIn,
	tones,
} from "./fallbacks.tsx";
import { docListQuery, docQuery } from "./queries.ts";
import type { ChainId } from "./switches.ts";

type AppError = Boundary.RpcErrors<typeof DocRpcs>;

// Every chain the type switches can build and compile, from the outside in.

export { App, Network };

const [App] = Boundary.root<DocsClient, AppError>({
	fallback: Crashed,
	name: "App",
});

const [Network, useNetwork] = Boundary.catchErrors(App, {
	fallback: Offline,
	name: "Network",
	tags: ["RpcClientError"],
});

const [Session, useSession] = Boundary.catchErrors(Network, {
	fallback: SignIn,
	name: "Session",
	tags: ["Unauthorized"],
});

const [DocAccess, useDocAccess] = Boundary.catchErrors(Session, {
	fallback: RequestAccess,
	name: "DocAccess",
	tags: ["Forbidden"],
});

const [DocExists, useDocExists] = Boundary.catchErrors(DocAccess, {
	fallback: Restore,
	name: "DocExists",
	tags: ["DocNotFound"],
});

const [DocAccessAlso, useDocAccessAlso] = Boundary.catchErrors(Network, {
	fallback: RequestAccessOrSignIn,
	name: "DocAccess",
	tags: ["Forbidden", "Unauthorized"],
});

const [DocExistsAlso, useDocExistsAlso] = Boundary.catchErrors(DocAccessAlso, {
	fallback: Restore,
	name: "DocExists",
	tags: ["DocNotFound"],
});

function TypeChip(props: { readonly children: string }) {
	return (
		<code className="block w-fit max-w-full rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] [overflow-wrap:anywhere] text-muted-foreground">
			{props.children}
		</code>
	);
}

function Inline(props: { readonly children: ReactNode }) {
	return (
		<section
			className={cn(
				"rounded-lg border-2 bg-emerald-500/5 px-3 py-2 text-sm",
				tones.inline,
			)}
		>
			<span className="text-foreground">{props.children}</span>
		</section>
	);
}

interface DocListProps {
	readonly list: QueryHandle<typeof docListQuery>;
	readonly onSelect: (id: number) => void;
	readonly selected: number;
}

function DocLinks(props: DocListProps & { readonly docs: ReadonlyArray<Doc> }) {
	return (
		<ul className="grid gap-0.5 text-sm">
			{[...props.docs, { id: 99, title: "A doc that doesn’t exist" }].map(
				(doc) => (
					<li key={doc.id}>
						<button
							className={cn(
								"w-full rounded px-2 py-1 text-left hover:bg-muted",
								props.selected === doc.id && "bg-muted font-medium",
							)}
							onClick={() => {
								props.onSelect(doc.id);
							}}
							type="button"
						>
							{doc.title}
						</button>
					</li>
				),
			)}
		</ul>
	);
}

/** Inside Session, the chain catches everything ListDocs can fail with. */
function SessionDocList(props: DocListProps) {
	const docs = useSession(docListQuery, props.list);
	return (
		<nav className="grid min-w-0 content-start gap-1.5">
			<TypeChip>useSession(…): Doc[]</TypeChip>
			<DocLinks {...props} docs={docs} />
		</nav>
	);
}

/**
 * Without Session, `Unauthorized` reaches the list. No boundary showed it,
 * so no fallback's retry loads the list again: it signs in itself.
 */
function NetworkDocList(props: DocListProps) {
	const client = useQueryClient();
	const docs = useNetwork(docListQuery, props.list);
	return (
		<nav className="grid min-w-0 content-start gap-1.5">
			<TypeChip>useNetwork(…): Doc[] | Unhandled&lt;Unauthorized&gt;</TypeChip>
			{Boundary.isUnhandled(docs) ? (
				<Inline>
					<span className="grid justify-items-start gap-2">
						{signedOut(docs.error)}
						<Button
							onClick={() => {
								setChaos({ signedIn: true });
								void client.reset({});
							}}
							size="xs"
						>
							Sign in
						</Button>
					</span>
				</Inline>
			) : (
				<DocLinks {...props} docs={docs} />
			)}
		</nav>
	);
}

function signedOut(error: Unauthorized) {
	return Match.valueTags(error, {
		Unauthorized: () =>
			"Signed out: no boundary above the list catches Unauthorized, so it matched it.",
	});
}

interface DocPageProps {
	readonly doc: QueryHandle<typeof docQuery>;
}

/** Reads through DocAccess: `DocNotFound` is left. */
function inlineDocPage(useRead: typeof useDocAccess) {
	return function DocPage(props: DocPageProps) {
		const doc = useRead(docQuery, props.doc);
		return (
			<div className="grid gap-2">
				<TypeChip>useDocAccess(…): Doc | Unhandled&lt;DocNotFound&gt;</TypeChip>
				{Boundary.isUnhandled(doc) ? (
					<Inline>
						{Match.valueTags(doc.error, {
							DocNotFound: (missing) =>
								`Doc ${missing.docId} doesn’t exist: no boundary catches DocNotFound, so this component matched it.`,
						})}
					</Inline>
				) : (
					<DocBody doc={doc} />
				)}
			</div>
		);
	};
}

/** Reads through DocExists: nothing is left. */
function plainDocPage(useRead: typeof useDocExists) {
	return function DocPage(props: DocPageProps) {
		const doc = useRead(docQuery, props.doc);
		return (
			<div className="grid gap-2">
				<TypeChip>useDocExists(…): Doc</TypeChip>
				<DocBody doc={doc} />
			</div>
		);
	};
}

function DocBody(props: { readonly doc: Doc }) {
	return (
		<article className="grid gap-1">
			<h3 className="font-semibold">{props.doc.title}</h3>
			<p className="text-sm text-muted-foreground">{props.doc.body}</p>
		</article>
	);
}

type Provider = ComponentType<{ readonly children?: ReactNode }>;

interface Chain {
	/** What DocAccess catches, for its outline. */
	readonly accessCatches: string;
	readonly DocAccess: Provider;
	readonly DocExists: Provider | undefined;
	readonly DocList: ComponentType<DocListProps>;
	readonly DocPage: ComponentType<DocPageProps>;
	readonly Session: Provider | undefined;
}

const sessionChain = {
	accessCatches: "Forbidden",
	DocAccess,
	DocList: SessionDocList,
	Session,
};

const twiceChain = {
	accessCatches: "Forbidden, Unauthorized",
	DocAccess: DocAccessAlso,
	DocList: NetworkDocList,
	Session: undefined,
};

export const chains = {
	"session-exists": {
		...sessionChain,
		DocExists,
		DocPage: plainDocPage(useDocExists),
	},
	"session-inline": {
		...sessionChain,
		DocExists: undefined,
		DocPage: inlineDocPage(useDocAccess),
	},
	"twice-exists": {
		...twiceChain,
		DocExists: DocExistsAlso,
		DocPage: plainDocPage(useDocExistsAlso),
	},
	"twice-inline": {
		...twiceChain,
		DocExists: undefined,
		DocPage: inlineDocPage(useDocAccessAlso),
	},
} satisfies { readonly [K in ChainId]: Chain };
