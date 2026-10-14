import { Button } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import { useQuery } from "@raf-query/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Effect } from "effect";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { EditBody } from "~/components/edit-body.tsx";
import { EditTitle } from "~/components/edit-title.tsx";
import { StatusSelect } from "~/components/status-select.tsx";
import { AssigneeCard } from "~/components/user.tsx";
import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

export const Route = createFileRoute("/issues/$issueId")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const id = Number(args.params.issueId);
		return qc.runPromise(
			qc.effect.ensure(issueQuery, { id }).pipe(
				Effect.catchTag("IssueNotFound", () => Effect.fail(notFound())),
				Effect.map((issue) => ({
					assignee: qc.prefetch(assigneeQuery, { issueId: id }),
					comments: qc.prefetch(commentsQuery, { issueId: id }),
					issue,
				})),
			),
		);
	},
	component: IssuePage,
});

function IssuePage() {
	const data = Route.useLoaderData();
	const [issue] = useQuery(issueQuery, data.issue);

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
					<p className="text-sm text-muted-foreground">
						Opened {new Date(issue.createdAt).toDateString()}
					</p>
					<EditBody issue={issue} />
					<Separator />
					<Suspense fallback={<CommentsSkeleton />} key={issue.id}>
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
							<StatusSelect
								align="end"
								issueId={issue.id}
								status={issue.status}
							/>
						</div>
					</section>
					<AssigneeCard handle={data.assignee} />
				</aside>
			</div>
		</div>
	);
}
