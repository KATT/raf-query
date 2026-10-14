"use client";

import { Button } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import {
	type EnsuredQueryHandle,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { AppLink } from "./settings.tsx";
import { Suspense } from "react";

import { assigneeQuery, commentsQuery, issueQuery } from "~/queries.ts";

import { Comments, CommentsSkeleton } from "./comments.tsx";
import { EditBody } from "./edit-body.tsx";
import { EditTitle } from "./edit-title.tsx";
import { StatusSelect } from "./status-select.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "./user.tsx";

export function IssuePage(props: {
	readonly assignee: QueryHandle<typeof assigneeQuery>;
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly issue: EnsuredQueryHandle<typeof issueQuery>;
}) {
	const [issue] = useQuery(issueQuery, props.issue);

	return (
		<div className="grid gap-6">
			<nav className="flex items-center gap-2">
				<Button asChild size="sm" variant="ghost">
					<AppLink href="/issues">
						<ArrowLeft /> All issues
					</AppLink>
				</Button>
				<div className="ml-auto flex gap-1">
					{issue.id > 1 ? (
						<Button asChild size="icon" variant="outline">
							<AppLink
								aria-label="Previous issue"
								href={`/issues/${issue.id - 1}`}
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
						<AppLink aria-label="Next issue" href={`/issues/${issue.id + 1}`}>
							<ChevronRight />
						</AppLink>
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
							<StatusSelect
								align="end"
								issueId={issue.id}
								status={issue.status}
							/>
						</div>
					</section>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={props.assignee} />
					</Suspense>
				</aside>
			</div>
		</div>
	);
}
