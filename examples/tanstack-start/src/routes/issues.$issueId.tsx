import { Button } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import { unwrap, useQuery } from "@raf-query/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { StatusBadge } from "~/components/status-badge.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "~/components/user.tsx";
import { commentsQuery, issueQuery } from "~/queries.ts";

export const Route = createFileRoute("/issues/$issueId")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		const comments = qc.prefetch(commentsQuery, { issueId: id });
		const issue = await qc.ensure(issueQuery, { id });
		return { comments, issue };
	},
	component: IssuePage,
});

function IssuePage() {
	const data = Route.useLoaderData();
	const [issuePromise] = useQuery(issueQuery, data.issue);
	const issue = unwrap(issuePromise);

	return (
		<div className="grid gap-6">
			<nav className="flex items-center gap-2">
				<Button asChild size="sm" variant="ghost">
					<Link to="/issues">
						<ArrowLeft /> All issues
					</Link>
				</Button>
				<div className="ml-auto flex gap-1">
					<Button
						asChild
						disabled={issue.id <= 1}
						size="icon"
						variant="outline"
					>
						<Link
							aria-label="Previous issue"
							disabled={issue.id <= 1}
							params={{ issueId: String(issue.id - 1) }}
							to="/issues/$issueId"
						>
							<ChevronLeft />
						</Link>
					</Button>
					<Button asChild size="icon" variant="outline">
						<Link
							aria-label="Next issue"
							params={{ issueId: String(issue.id + 1) }}
							to="/issues/$issueId"
						>
							<ChevronRight />
						</Link>
					</Button>
				</div>
			</nav>
			<div className="grid gap-8 md:grid-cols-[1fr_240px]">
				<article className="grid content-start gap-6">
					<EditTitle issue={issue} />
					<div className="flex items-center gap-3 text-sm text-muted-foreground">
						<StatusBadge status={issue.status} />
						Opened {new Date(issue.createdAt).toDateString()}
					</div>
					<p className="text-sm whitespace-pre-line">{issue.body}</p>
					<Separator />
					<Suspense fallback={<CommentsSkeleton />} key={issue.id}>
						<Comments handle={data.comments} />
					</Suspense>
				</article>
				<aside>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard userId={issue.assigneeId} />
					</Suspense>
				</aside>
			</div>
		</div>
	);
}
