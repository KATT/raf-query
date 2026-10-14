import { Avatar, AvatarFallback } from "@examples/ui/components/avatar";
import { Card, CardContent } from "@examples/ui/components/card";
import { Skeleton } from "@examples/ui/components/skeleton";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { Result, Schema } from "effect";
import { use } from "react";

import { assigneeQuery } from "~/queries.ts";
import { IssueNotFound } from "~/rpc.ts";

function initials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("");
}

/**
 * Reads the assignee as `Result<User, …>`. The client's `layer` defaults
 * `throwOnError` to false, so `use()` never throws — match the Result.
 */
export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [userPromise, controls] = useQuery(assigneeQuery, props.handle);
	const user = use(userPromise);
	return Result.match(user, {
		onFailure: (error) =>
			Schema.is(IssueNotFound)(error) ? null : (
				<div role="alert">
					<p className="text-sm text-destructive">
						Could not load the assignee.
					</p>
					<button
						className="text-sm underline"
						onClick={() => {
							void controls.refetch();
						}}
						type="button"
					>
						Try again
					</button>
				</div>
			),
		onSuccess: (assignee) => (
			<Card className="py-4">
				<CardContent className="flex items-center gap-3 px-4">
					<Avatar>
						<AvatarFallback>{initials(assignee.name)}</AvatarFallback>
					</Avatar>
					<div className="grid">
						<span className="text-xs text-muted-foreground">Assignee</span>
						<span className="font-medium">{assignee.name}</span>
						<span className="text-xs text-muted-foreground">
							{assignee.title}
						</span>
					</div>
				</CardContent>
			</Card>
		),
	});
}

export function AssigneeCardSkeleton() {
	return <Skeleton className="h-[74px]" />;
}
