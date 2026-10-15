import { CommentsSkeleton } from "@examples/kit/components/comments";
import {
	IssueBodySkeleton,
	StatusSkeleton,
} from "@examples/kit/components/issue-page";
import { AssigneeCardSkeleton } from "@examples/kit/components/user";
import { Button, buttonVariants } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import { cn } from "@examples/ui/lib/utils";
import { dehydrate, type QueryHandle, useQuery } from "@raf-query/react";
import { HydrationBoundary } from "@raf-query/experimental-react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, use } from "react";
import { Link } from "react-router";

import { Comments } from "~/components/comments.tsx";
import { EditBody } from "~/components/edit-body.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { StatusSelect } from "~/components/status-select.tsx";
import { AssigneeCard } from "~/components/user.tsx";
import { createAppQueryClient } from "~/query-client.ts";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";
import { withRequest } from "~/settings.ts";

import type { Route } from "./+types/issues.$issueId";

export async function loader(args: Route.LoaderArgs) {
	return withRequest(args.request, () => {
		const id = Number(args.params.issueId);
		const { queryClient } = createAppQueryClient();
		const assignee = queryClient.prefetch(assigneeQuery, { issueId: id });
		const comments = queryClient.prefetch(commentsQuery, { issueId: id });
		const issue = queryClient.prefetch(issueQuery, { id });
		return {
			assignee,
			comments,
			dehydratedState: dehydrate(queryClient),
			id,
			issue,
		};
	});
}

export default function IssuePage(props: Route.ComponentProps) {
	const data = props.loaderData;

	return (
		<HydrationBoundary state={data.dehydratedState}>
			<div className="grid gap-6">
				<IssueNav id={data.id} />
				<div className="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_240px]">
					<article className="grid content-start gap-6 md:col-start-1">
						<Suspense fallback={<IssueBodySkeleton id={data.id} />}>
							<IssueBody handle={data.issue} />
						</Suspense>
					</article>
					<aside className="grid content-start gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
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
					<div className="grid gap-6 md:col-start-1">
						<Separator />
						<Suspense fallback={<CommentsSkeleton />}>
							<Comments handle={data.comments} />
						</Suspense>
					</div>
				</div>
			</div>
		</HydrationBoundary>
	);
}

function IssueNav(props: { readonly id: number }) {
	return (
		<nav className="flex items-center gap-2">
			<Link
				className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
				to="/issues"
			>
				<ArrowLeft /> All issues
			</Link>
			<div className="ml-auto flex gap-1">
				{props.id > 1 ? (
					<Link
						aria-label="Previous issue"
						className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
						title="Previous issue"
						to={`/issues/${props.id - 1}`}
					>
						<ChevronLeft />
					</Link>
				) : (
					<Button
						aria-label="Previous issue"
						disabled
						size="icon"
						title="Previous issue"
						variant="outline"
					>
						<ChevronLeft />
					</Button>
				)}
				<Link
					aria-label="Next issue"
					className={cn(buttonVariants({ size: "icon", variant: "outline" }))}
					title="Next issue"
					to={`/issues/${props.id + 1}`}
				>
					<ChevronRight />
				</Link>
			</div>
		</nav>
	);
}

function useIssue(handle: QueryHandle<typeof issueQuery>) {
	const [issuePromise] = useQuery(issueQuery, handle);
	const issue = use(issuePromise);
	if (!issue) {
		throw new Response("Not Found", { status: 404 });
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

function IssueStatus(props: {
	readonly handle: QueryHandle<typeof issueQuery>;
}) {
	const issue = useIssue(props.handle);
	return <StatusSelect align="end" issueId={issue.id} status={issue.status} />;
}
