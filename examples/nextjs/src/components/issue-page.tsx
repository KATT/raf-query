"use client";

import { Button } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AppLink } from "./settings.tsx";
import { Suspense, use } from "react";

import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

import { Comments, CommentsSkeleton } from "./comments.tsx";
import { EditBody } from "./edit-body.tsx";
import { EditTitle } from "./edit-title.tsx";
import { StatusSelect } from "./status-select.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "./user.tsx";

export function IssuePage(props: {
	readonly assignee: QueryHandle<typeof assigneeQuery>;
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly issue: QueryHandle<typeof issueQuery>;
}) {
	const id = props.issue.input.id;

	return (
		<div className="grid gap-6">
			<IssueNav id={id} />
			<div className="grid gap-8 md:grid-cols-[1fr_240px]">
				<article className="grid content-start gap-6">
					{/* Sibling boundaries that share a key leak the earlier one. */}
					<Suspense
						fallback={<IssueBodySkeleton id={id} />}
						key={`issue-${id}`}
					>
						<IssueBody handle={props.issue} />
					</Suspense>
					<Separator />
					<Suspense fallback={<CommentsSkeleton />} key={`comments-${id}`}>
						<Comments handle={props.comments} />
					</Suspense>
				</article>
				<aside className="grid content-start gap-4">
					<section className="grid gap-3 rounded-lg border p-3">
						<h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Properties
						</h2>
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-muted-foreground">Status</span>
							<Suspense fallback={<StatusSkeleton />} key={`status-${id}`}>
								<IssueStatus handle={props.issue} />
							</Suspense>
						</div>
					</section>
					<Suspense fallback={<AssigneeCardSkeleton />} key={`assignee-${id}`}>
						<AssigneeCard handle={props.assignee} />
					</Suspense>
				</aside>
			</div>
		</div>
	);
}

/** Back, previous, and next come from the URL, so the bar renders before the issue. */
function IssueNav(props: { readonly id: number }) {
	return (
		<nav className="flex items-center gap-2">
			<Button asChild size="sm" variant="ghost">
				<AppLink href="/issues">
					<ArrowLeft /> All issues
				</AppLink>
			</Button>
			<div className="ml-auto flex gap-1">
				{props.id > 1 ? (
					<Button asChild size="icon" variant="outline">
						<AppLink
							aria-label="Previous issue"
							href={`/issues/${props.id - 1}`}
						>
							<ChevronLeft />
						</AppLink>
					</Button>
				) : (
					<Button
						aria-label="Previous issue"
						disabled
						size="icon"
						variant="outline"
					>
						<ChevronLeft />
					</Button>
				)}
				<Button asChild size="icon" variant="outline">
					<AppLink aria-label="Next issue" href={`/issues/${props.id + 1}`}>
						<ChevronRight />
					</AppLink>
				</Button>
			</div>
		</nav>
	);
}

function useIssue(handle: QueryHandle<typeof issueQuery>) {
	const [issuePromise] = useQuery(issueQuery, handle);
	const issue = use(issuePromise);
	if (!issue) {
		notFound();
	}
	return issue;
}

function IssueBody(props: { readonly handle: QueryHandle<typeof issueQuery> }) {
	const issue = useIssue(props.handle);

	return (
		<div className="grid gap-6">
			<EditTitle issue={issue} />
			<p className="text-sm text-muted-foreground">
				Opened {new Date(issue.createdAt).toDateString()}
			</p>
			<EditBody issue={issue} />
		</div>
	);
}

function IssueBodySkeleton(props: { readonly id: number }) {
	return (
		<div className="grid gap-6">
			<div className="flex items-baseline gap-2">
				<Skeleton className="h-9 min-w-0 flex-1" />
				<span className="shrink-0 text-lg text-muted-foreground">
					#{props.id}
				</span>
			</div>
			<Skeleton className="h-5 w-40" />
			<Skeleton className="h-28" />
		</div>
	);
}

function IssueStatus(props: {
	readonly handle: QueryHandle<typeof issueQuery>;
}) {
	const issue = useIssue(props.handle);
	return <StatusSelect align="end" issueId={issue.id} status={issue.status} />;
}

function StatusSkeleton() {
	return <Skeleton className="h-6 w-24 rounded-full" />;
}
