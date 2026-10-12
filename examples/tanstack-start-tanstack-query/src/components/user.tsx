import { Avatar, AvatarFallback } from "@examples/ui/components/avatar";
import { Card, CardContent } from "@examples/ui/components/card";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	unwrap,
	useQuery,
	useWaterfall,
} from "@raf-query/tanstack-react-query";

import { userQuery } from "~/queries.ts";

function initials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("");
}

/** The issue only says who's assigned, so the user loads after it renders. */
export function AssigneeCard(props: { readonly userId: string }) {
	const handle = useWaterfall(userQuery, { id: props.userId });
	const [userPromise] = useQuery(userQuery, handle);
	const user = unwrap(userPromise);

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

export function AssigneeCardSkeleton() {
	return <Skeleton className="h-[74px]" />;
}
