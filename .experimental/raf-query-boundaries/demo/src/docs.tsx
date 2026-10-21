import { Badge } from "@examples/ui/components/badge";
import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import type { QueryHandle } from "@raf-query/react";
import { cn } from "cn";
import { Match, Result } from "effect";
import { FileText, Lock } from "lucide-react";
import { useState } from "react";

import type { Doc } from "./api.ts";
import { DocAccess, useSession } from "./boundaries.tsx";
import { Caught } from "./frame.tsx";
import { docListQuery, docQuery, renameDoc } from "./queries.ts";

/** The type a hook returns here, as the compiler sees it. */
const TypeChip = (props: { readonly children: string }) => (
	<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
		{props.children}
	</code>
);

export const DocList = (props: {
	readonly list: QueryHandle<typeof docListQuery>;
	readonly onSelect: (id: number) => void;
	readonly selected: number;
}) => {
	// Session and the boundaries above it catch everything ListDocs can fail
	// with, so the hook returns the docs themselves: there is no failure here.
	const docs = useSession(docListQuery, props.list);
	return (
		<nav className="space-y-2">
			<TypeChip>useSession(docListQuery, list): DocSummary[]</TypeChip>
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

export const DocPage = (props: {
	readonly doc: QueryHandle<typeof docQuery>;
}) => {
	// Forbidden goes to DocAccess, Unauthorized to Session, RpcClientError to
	// Network: only DocNotFound is left for this component. `useDocAccess`
	// itself wouldn't type-check here; `useResult` hands back what's left.
	const result = DocAccess.useResult(docQuery, props.doc);
	return (
		<div className="space-y-3">
			<TypeChip>
				DocAccess.useResult(docQuery, doc): Result&lt;Doc, DocNotFound&gt;
			</TypeChip>
			{Result.isSuccess(result) ? (
				<DocView doc={result.success} />
			) : (
				<Caught name="DocPage" tone="inline" what="DocNotFound, inline">
					<p className="text-sm">
						{/* Exhaustive: give GetDoc another error, and this stops compiling. */}
						{Match.valueTags(result.failure, {
							DocNotFound: (missing) => `Doc ${missing.docId} doesn’t exist.`,
						})}{" "}
						No boundary catches <code>DocNotFound</code>, so it came back as the{" "}
						<code>Result</code>’s failure, and <code>Match.valueTags</code> had
						to handle it.
					</p>
				</Caught>
			)}
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
	const run = DocAccess.useRun();
	const [title, setTitle] = useState(props.doc.title);
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string>();
	return (
		<form
			className="space-y-2 rounded-lg border p-3"
			onSubmit={async (event) => {
				event.preventDefault();
				setPending(true);
				// Result<Doc, DocNotFound | EmptyTitle>: the rest went to the boundaries.
				const result = await run.result(renameDoc(props.doc.id, title));
				setPending(false);
				setProblem(
					Result.isSuccess(result)
						? undefined
						: Match.valueTags(result.failure, {
								DocNotFound: () => "This doc was deleted meanwhile.",
								EmptyTitle: () => "A title can’t be empty.",
							}),
				);
			}}
		>
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">Rename</span>
				<TypeChip>
					run.result(renameDoc): Result&lt;Doc, DocNotFound | EmptyTitle&gt;
				</TypeChip>
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
