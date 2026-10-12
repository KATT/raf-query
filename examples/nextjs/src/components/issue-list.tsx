"use client";

import type { IssueListInput } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import { Card } from "@examples/ui/components/card";
import { Skeleton } from "@examples/ui/components/skeleton";
import { cn } from "@examples/ui/lib/utils";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { use } from "react";

import { issueListQuery } from "~/queries.ts";

import { StatusBadge } from "./status-badge.tsx";

const dateFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
});

function PageLink(props: {
	readonly children: string;
	readonly input: IssueListInput;
	readonly page: number | null;
}) {
	if (props.page === null) {
		return (
			<Button disabled size="sm" variant="outline">
				{props.children}
			</Button>
		);
	}
	return (
		<Button asChild size="sm" variant="outline">
			<Link
				href={{
					pathname: "/issues",
					query: { ...props.input, page: props.page },
				}}
			>
				{props.children}
			</Link>
		</Button>
	);
}

export function IssueList(props: {
	readonly handle: QueryHandle<typeof issueListQuery>;
}) {
	const [listPromise, listState] = useQuery(issueListQuery, props.handle, {
		whilePending: "previous",
	});
	const list = use(listPromise);
	const input: IssueListInput = listState.input;

	return (
		<div
			aria-busy={listState.isPrevious}
			className={cn(
				"grid gap-4 transition-opacity",
				listState.isPrevious && "opacity-50",
			)}
		>
			<Card className="gap-0 divide-y py-0">
				{list.issues.length === 0 ? (
					<p className="p-6 text-sm text-muted-foreground">No issues.</p>
				) : null}
				{list.issues.map((issue) => (
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
			<div className="flex items-center justify-between text-sm text-muted-foreground">
				<span>
					Page {list.page} of {list.pageCount} · {list.total} issues
				</span>
				<div className="flex gap-2">
					<PageLink input={input} page={list.page > 1 ? list.page - 1 : null}>
						Previous
					</PageLink>
					<PageLink
						input={input}
						page={list.page < list.pageCount ? list.page + 1 : null}
					>
						Next
					</PageLink>
				</div>
			</div>
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
