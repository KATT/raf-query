"use client";

import { Button } from "@examples/ui/components/button";
import { Separator } from "@examples/ui/components/separator";
import {
	type QueryHandle,
	unwrap,
	useQuery,
} from "@raf-query/tanstack-react-query";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { commentsQuery, issueQuery, userQuery } from "~/queries.ts";

import { Comments, CommentsSkeleton } from "./comments.tsx";
import { EditTitle } from "./edit-title.tsx";
import { StatusBadge } from "./status-badge.tsx";
import { AssigneeCard, AssigneeCardSkeleton } from "./user.tsx";

export function IssuePage(props: {
	readonly assignee: QueryHandle<typeof userQuery>;
	readonly comments: QueryHandle<typeof commentsQuery>;
	readonly issue: QueryHandle<typeof issueQuery>;
}) {
	const [issuePromise] = useQuery(issueQuery, props.issue);
	const issue = unwrap(issuePromise);

	return (
		<div className="grid gap-6">
			<nav className="flex items-center gap-2">
				<Button asChild size="sm" variant="ghost">
					<Link href="/issues">
						<ArrowLeft /> All issues
					</Link>
				</Button>
				<div className="ml-auto flex gap-1">
					{issue.id > 1 ? (
						<Button asChild size="icon" variant="outline">
							<Link
								aria-label="Previous issue"
								href={`/issues/${issue.id - 1}`}
							>
								<ChevronLeft />
							</Link>
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
						<Link aria-label="Next issue" href={`/issues/${issue.id + 1}`}>
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
						<Comments handle={props.comments} />
					</Suspense>
				</article>
				<aside>
					<Suspense fallback={<AssigneeCardSkeleton />}>
						<AssigneeCard handle={props.assignee} />
					</Suspense>
				</aside>
			</div>
		</div>
	);
}
