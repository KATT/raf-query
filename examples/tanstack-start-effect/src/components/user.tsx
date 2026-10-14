import { Avatar, AvatarFallback } from "@examples/ui/components/avatar";
import { Card, CardContent } from "@examples/ui/components/card";
import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { CatchBoundary } from "@tanstack/react-router";
import { Schema } from "effect";
import { Suspense, use } from "react";

import { assigneeQuery } from "~/queries.ts";
import { IssueNotFound } from "~/rpc.ts";

function initials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("");
}

function AssigneeCardInner(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [userPromise] = useQuery(assigneeQuery, props.handle);
	const user = use(userPromise);
	return (
		<Card className="py-4">
			<CardContent className="flex items-center gap-3 px-4">
				<Avatar>
					<AvatarFallback>{initials(user.name)}</AvatarFallback>
				</Avatar>
				<div className="grid">
					<span className="text-xs text-muted-foreground">Assignee</span>
					<span className="font-medium">{user.name}</span>
					<span className="text-xs text-muted-foreground">{user.title}</span>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * Reads the assignee as `User`. A typed `IssueNotFound` (the issue vanished
 * beside a successful detail fetch) renders nothing; anything else retries.
 */
export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	return (
		<CatchBoundary
			errorComponent={(boundary) =>
				Schema.is(IssueNotFound)(boundary.error) ? null : (
					<div role="alert">
						<p className="text-sm text-destructive">
							Could not load the assignee.
						</p>
						<button
							className="text-sm underline"
							onClick={boundary.reset}
							type="button"
						>
							Try again
						</button>
					</div>
				)
			}
			getResetKey={() => props.handle.input.issueId}
		>
			<Suspense fallback={<AssigneeCardSkeleton />}>
				<AssigneeCardInner handle={props.handle} />
			</Suspense>
		</CatchBoundary>
	);
}

export function AssigneeCardSkeleton() {
	return <Skeleton className="h-[74px]" />;
}
