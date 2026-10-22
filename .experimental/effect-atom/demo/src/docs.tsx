import { Badge } from "@examples/ui/components/badge";
import { Button } from "@examples/ui/components/button";
import { Input } from "@examples/ui/components/input";
import { Boundary } from "@raf-query/experimental-effect-atom";
import { cn } from "cn";
import { Match } from "effect";
import { FileText, Lock } from "lucide-react";
import { useState } from "react";

import type { Doc } from "./api.ts";
import { docAtom, docListAtom, renameDocAtom } from "./atoms.ts";
import {
	DocAccess,
	DocAccessAll,
	useDocAccess,
	useDocAccessAll,
	useSession,
} from "./boundaries.tsx";
import { Caught } from "./frame.tsx";

/** The type a hook returns here, as the compiler sees it. */
const TypeChip = (props: { readonly children: string }) => (
	<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
		{props.children}
	</code>
);

export const DocList = (props: {
	readonly onSelect: (id: number) => void;
	readonly selected: number;
}) => {
	// Session and the boundaries above it catch everything ListDocs can fail
	// with, so the hook returns the docs themselves: there is no failure here.
	const docs = useSession(docListAtom);
	return (
		<nav className="space-y-2">
			<TypeChip>useSession(docListAtom): DocSummary[]</TypeChip>
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

/** Renames the doc to `title`; resolves to the problem to show, if any. */
type Save = (title: string) => Promise<string | undefined>;

export const DocPage = (props: { readonly id: number }) => {
	// Forbidden went to DocAccess, Unauthorized to Session, RpcClientError to
	// Network: only DocNotFound is left for this component.
	const doc = useDocAccess(docAtom(props.id));
	const rename = Boundary.useSet(DocAccess, renameDocAtom);
	return (
		<div className="space-y-3">
			<TypeChip>
				useDocAccess(docAtom(id)): Doc | Unhandled&lt;DocNotFound&gt;
			</TypeChip>
			{Boundary.isUnhandled(doc) ? (
				<Caught name="DocPage" tone="inline" what="DocNotFound, inline">
					<p className="text-sm">
						{/* Exhaustive: give GetDoc another error, and this stops compiling. */}
						{Match.valueTags(doc.error, {
							DocNotFound: (missing) => `Doc ${missing.docId} doesn’t exist.`,
						})}{" "}
						No boundary catches <code>DocNotFound</code>, so it came back as an{" "}
						<code>Unhandled</code>, and <code>Match.valueTags</code> had to
						handle it.
					</p>
				</Caught>
			) : (
				<DocView
					doc={doc}
					save={async (title) => {
						// Doc | Unhandled<DocNotFound | EmptyTitle>: the rest went to the boundaries.
						const renamed = await rename({
							payload: { id: props.id, title },
							reactivityKeys: ["docs"],
						});
						return Boundary.isUnhandled(renamed)
							? Match.valueTags(renamed.error, {
									DocNotFound: () => "This doc was deleted meanwhile.",
									EmptyTitle: () => "A title can’t be empty.",
								})
							: undefined;
					}}
					saveType="Doc | Unhandled<DocNotFound | EmptyTitle>"
				/>
			)}
		</div>
	);
};

/**
 * The page under `DocAccessAll`, which catches `DocNotFound` too: the hook
 * returns the doc itself, and a rename can only be left with `EmptyTitle`.
 */
export const DocPageAll = (props: { readonly id: number }) => {
	const doc = useDocAccessAll(docAtom(props.id));
	const rename = Boundary.useSet(DocAccessAll, renameDocAtom);
	return (
		<div className="space-y-3">
			<TypeChip>useDocAccess(docAtom(id)): Doc</TypeChip>
			<DocView
				doc={doc}
				save={async (title) => {
					const renamed = await rename({
						payload: { id: props.id, title },
						reactivityKeys: ["docs"],
					});
					return Boundary.isUnhandled(renamed)
						? Match.valueTags(renamed.error, {
								EmptyTitle: () => "A title can’t be empty.",
							})
						: undefined;
				}}
				saveType="Doc | Unhandled<EmptyTitle>"
			/>
		</div>
	);
};

const DocView = (props: {
	readonly doc: Doc;
	readonly save: Save;
	readonly saveType: string;
}) => (
	<article className="space-y-3">
		<header>
			<h2 className="text-xl font-semibold">{props.doc.title}</h2>
			<p className="text-xs text-muted-foreground">
				Last edited by {props.doc.updatedBy}
			</p>
		</header>
		<p className="text-sm leading-relaxed">{props.doc.body}</p>
		<RenameForm
			key={props.doc.title}
			save={props.save}
			saveType={props.saveType}
			title={props.doc.title}
		/>
	</article>
);

const RenameForm = (props: {
	readonly save: Save;
	readonly saveType: string;
	readonly title: string;
}) => {
	const [title, setTitle] = useState(props.title);
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string>();
	return (
		<form
			className="space-y-2 rounded-lg border p-3"
			onSubmit={async (event) => {
				event.preventDefault();
				setPending(true);
				const found = await props.save(title);
				setPending(false);
				setProblem(found);
			}}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-sm font-medium">Rename</span>
				<TypeChip>{`rename(…): ${props.saveType}`}</TypeChip>
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
