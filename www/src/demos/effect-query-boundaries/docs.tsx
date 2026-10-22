import { Badge } from "@examples/ui/components/badge";
import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import { cn } from "@examples/ui/lib/utils";
import { Boundary, type Query } from "@raf-query/experimental-effect-query";
import { Match } from "effect";
import { FileText, Lock } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Doc, DocNotFound } from "./api.ts";
import {
	type AppError,
	chainOf,
	type Services,
	useRunErased,
} from "./boundaries.tsx";
import { layoutOf, leftOf } from "./configs.ts";
import { Caught } from "./frame.tsx";
import { docList, docQuery, renameDoc } from "./queries.ts";
import { getConfig } from "./switches.ts";

type Read<A> = Query.Query<A, AppError, Services>;

// The app remounts when the type switches change, so each of these calls
// the same boundary's hook on every render of a mount.

/** `DocList`'s read: the hook of the innermost of `App`, `Network`, `Session`. */
const useList = <A,>(query: Read<A>) =>
	chainOf(getConfig()).list.useRead(query);

/** `DocPage`'s read: the hook of the innermost boundary. */
const usePage = <A,>(query: Read<A>) =>
	chainOf(getConfig()).page.useRead(query);

/**
 * The data, read as the code does when it skips `isUnhandled`. The switches
 * make reads the compiler rejects, and the code panel shows what it says; at
 * runtime an `Unhandled` has none of the data's fields.
 */
const unchecked = <A,>(read: A | Boundary.Unhandled<AppError>) =>
	// SAFETY: see above; the compiler only takes this code when nothing is left.
	read as A;

// SAFETY: the switches make matches the compiler rejects, and the code panel
// shows what it says; at runtime `valueTags` throws on a tag it has no case for.
const matchErased = Match.valueTags as unknown as (
	error: AppError,
	cases: { readonly DocNotFound?: (gone: DocNotFound) => ReactNode },
) => ReactNode;

/** The type a hook returns here, as the compiler sees it. */
const TypeChip = (props: { readonly children: string }) => (
	<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] break-all text-muted-foreground">
		{props.children}
	</code>
);

/** What a read's type is: the data, or the data and an `Unhandled` of what's left. */
const readOf = (data: string, left: ReadonlyArray<string>) =>
	left.length === 0 ? data : `${data} | Unhandled<${left.join(" | ")}>`;

export const DocList = (props: {
	readonly onSelect: (id: number) => void;
	readonly selected: number;
}) => {
	const config = getConfig();
	// Like the code, it maps over what it read without checking: while
	// anything is left that doesn't compile, and an Unhandled has no `map`.
	const docs = unchecked(useList(docList));
	return (
		<nav className="space-y-2">
			<TypeChip>
				{`use${layoutOf(config).list}(docList): ${readOf("DocSummary[]", leftOf(config, "list"))}`}
			</TypeChip>
			<ul className="space-y-1">
				{docs.map((doc) => (
					<li key={doc.id}>
						<button
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
								props.selected === doc.id && "bg-muted font-medium",
							)}
							onClick={() => props.onSelect(doc.id)}
							type="button"
						>
							{doc.locked ? (
								<Lock className="size-3.5" />
							) : (
								<FileText className="size-3.5" />
							)}
							{doc.title}
						</button>
					</li>
				))}
				<li>
					<button
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground italic hover:bg-muted",
							props.selected === 99 && "bg-muted",
						)}
						onClick={() => props.onSelect(99)}
						type="button"
					>
						<FileText className="size-3.5" />a doc that doesn’t exist
					</button>
				</li>
			</ul>
		</nav>
	);
};

/**
 * What no boundary catches comes back here, as an `Unhandled`. With the
 * "skips isUnhandled" switch on, it reads the doc without checking.
 */
export const DocPage = (props: { readonly id: number }) => {
	const config = getConfig();
	const doc = usePage(docQuery(props.id));
	const chip = (
		<TypeChip>
			{`use${layoutOf(config).page}(docQuery(id)): ${readOf("Doc", leftOf(config, "page"))}`}
		</TypeChip>
	);
	if (config.unchecked || !Boundary.isUnhandled(doc)) {
		return (
			<div className="space-y-3">
				{chip}
				<DocView doc={unchecked(doc)} />
			</div>
		);
	}
	// oxlint-disable-next-line eslint/no-underscore-dangle -- the errors boundaries catch are tagged
	const tag = doc.error._tag;
	return (
		<div className="space-y-3">
			{chip}
			<Caught name="DocPage" tone="inline" what={`${tag}, inline`}>
				<p className="text-sm">
					{matchErased(
						doc.error,
						config.match
							? { DocNotFound: (gone) => `Doc ${gone.docId} doesn’t exist.` }
							: {},
					)}{" "}
					No boundary catches <code>{tag}</code>, so it came back as an{" "}
					<code>Unhandled</code>, and <code>Match.valueTags</code> had to handle
					its error.
				</p>
			</Caught>
		</div>
	);
};

const DocView = (props: { readonly doc: Doc }) => (
	<article className="space-y-3">
		<header>
			<h2 className="text-xl font-semibold">{props.doc.title}</h2>
			<p className="text-xs text-muted-foreground">
				Last edited by {props.doc.updatedBy}
			</p>
		</header>
		<p className="text-sm leading-relaxed">{props.doc.body}</p>
		<RenameForm doc={props.doc} key={props.doc.title} />
	</article>
);

const RenameForm = (props: { readonly doc: Doc }) => {
	const run = useRunErased(chainOf(getConfig()).page.Provider);
	const [title, setTitle] = useState(props.doc.title);
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string>();
	return (
		<form
			className="space-y-2 rounded-lg border p-3"
			onSubmit={async (event) => {
				event.preventDefault();
				setPending(true);
				// What the chain doesn't catch comes back: DocNotFound and EmptyTitle,
				// with the default switches.
				const renamed = await run(renameDoc(props.doc.id, title));
				setPending(false);
				setProblem(
					Boundary.isUnhandled(renamed)
						? Match.valueTags(renamed.error, {
								DocNotFound: () => "This doc was deleted meanwhile.",
								EmptyTitle: () => "A title can’t be empty.",
								Forbidden: () => "Forbidden came back: nothing caught it.",
								RpcClientError: () =>
									"RpcClientError came back: nothing caught it.",
								Unauthorized: () =>
									"Unauthorized came back: nothing caught it.",
							})
						: undefined,
				);
			}}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-sm font-medium">Rename</span>
				<TypeChip>run(renameDoc): Doc | Unhandled&lt;what’s left&gt;</TypeChip>
			</div>
			<div className="flex gap-2">
				<Input
					aria-label="Title"
					onChange={(event) => setTitle(event.target.value)}
					value={title}
				/>
				<Button disabled={pending} type="submit">
					{pending ? "Saving…" : "Save"}
				</Button>
			</div>
			{problem === undefined ? null : (
				<p className="text-sm text-destructive" role="alert">
					<Badge variant="destructive">inline</Badge> {problem}
				</p>
			)}
		</form>
	);
};
