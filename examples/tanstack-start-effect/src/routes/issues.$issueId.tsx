import { Button } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Result, Schema } from "effect";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, use } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { EditBody } from "~/components/edit-body.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { StatusSelect } from "~/components/status-select.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "~/components/user.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { IssueNotFound } from "~/rpc.ts";

export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		return {
			assignee: qc.prefetch(assigneeQuery, { issueId: id }),
			comments: qc.prefetch(commentsQuery, { issueId: id }),
			issue: qc.prefetch(issueQuery, { id }),
		};
	},
	component: IssuePage,
	// Previous and next stay on this route, so a new id mounts a fresh page.
	remountDeps: (opts) => opts.params,
});

function IssuePage() {
	const data = Route.useLoaderData();
	const id = Number(Route.useParams().issueId);

	return (
		<div className="grid gap-6">
			<IssueNav id={id} />
			<div className="grid gap-8 md:grid-cols-[1fr_240px]">
				<article className="grid content-start gap-6">
					<Suspense fallback={<IssueBodySkeleton id={id} />}>
						<IssueBody handle={data.issue} />
					</Suspense>
					<Separator />
					<Suspense fallback={<CommentsSkeleton />}>
						<Comments handle={data.comments} />
					</Suspense>
				</article>
				<aside className="grid content-start gap-4">
					<section className="grid gap-3 rounded-lg border p-3">
						<h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Properties
						</h2>
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-muted-foreground">Status</span>
							<Suspense fallback={<StatusSkeleton />}>
								<IssueStatus handle={data.issue} />
							</Suspense>
						</div>
					</section>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={data.assignee} />
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
				<Link to="/issues">
					<ArrowLeft /> All issues
				</Link>
			</Button>
			<div className="ml-auto flex gap-1">
				<Button asChild disabled={props.id <= 1} size="icon" variant="outline">
					<Link
						aria-label="Previous issue"
						disabled={props.id <= 1}
						params={{ issueId: String(props.id - 1) }}
						to="/issues/$issueId"
					>
						<ChevronLeft />
					</Link>
				</Button>
				<Button asChild size="icon" variant="outline">
					<Link
						aria-label="Next issue"
						params={{ issueId: String(props.id + 1) }}
						to="/issues/$issueId"
					>
						<ChevronRight />
					</Link>
				</Button>
			</div>
		</nav>
	);
}

/**
 * Reads the issue as `Result<Issue, …>`. `IssueNotFound` is the router's
 * not-found page; any other failure throws to the error boundary.
 */
function useIssue(handle: QueryHandle<typeof issueQuery>) {
	const [issuePromise] = useQuery(issueQuery, handle);
	const issue = use(issuePromise);
	if (Result.isFailure(issue)) {
		if (Schema.is(IssueNotFound)(issue.failure)) {
			throw notFound();
		}
		throw issue.failure;
	}
	return issue.success;
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
