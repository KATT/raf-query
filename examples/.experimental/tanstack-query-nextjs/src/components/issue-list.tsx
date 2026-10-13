"use client";

import { Card } from "@examples/ui/components/card";
import { LoadMore } from "@examples/ui/components/load-more";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import {
	type QueryHandle,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { use } from "react";

import { issueListQuery } from "~/queries.ts";

import { StatusBadge } from "./status-badge.tsx";

const dateFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
});

export function IssueList(props: {
	readonly handle: QueryHandle<typeof issueListQuery>;
}) {
	const [pagesPromise, list] = useQuery(issueListQuery, props.handle, {
		whilePending: "previous",
	});
	const pages = use(pagesPromise);
	const issues = pages.pages.flatMap((page) => page.issues);
	const total = pages.pages.at(-1)?.total ?? 0;

	return (
		<div
			aria-busy={list.isPrevious}
			className={cn(
				"grid gap-4 transition-opacity",
				list.isPrevious && "opacity-50",
			)}
		>
			<Card className="gap-0 divide-y py-0">
				{issues.length === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">No issues.</p>
				) : null}
				{issues.map((issue) => (
					<Link
						className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
						href={`/issues/${issue.id}`}
						key={issue.id}
					>
						<span className="w-10 text-sm text-muted-foreground">
							#{issue.id}
						</span>
						<span className="flex-1 truncate font-medium">{issue.title}</span>
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<MessageSquare className="size-3" />
							{issue.commentCount}
						</span>
						<span className="w-14 text-right text-xs text-muted-foreground">
							{dateFormat.format(new Date(issue.createdAt))}
						</span>
						<StatusBadge status={issue.status} />
					</Link>
				))}
			</Card>
			<p className="text-sm text-muted-foreground">
				Showing {issues.length} of {total} issues
			</p>
			{list.hasNextPage ? (
				<LoadMore
					loading={list.isFetchingNextPage}
					onLoad={() => {
						void list.fetchNextPage();
					}}
				/>
			) : null}
		</div>
	);
}

export function IssueListSkeleton() {
	return (
		<Card className="gap-0 divide-y py-0">
			{Array.from({ length: 8 }, (_, index) => (
				<div className="px-4 py-3" key={index}>
					<Skeleton className="h-5 w-full" />
				</div>
			))}
		</Card>
	);
}
