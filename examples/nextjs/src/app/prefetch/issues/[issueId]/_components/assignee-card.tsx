"use client";

import { AssigneeCardView } from "@examples/kit/components/user";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { assigneeQuery } from "~/queries.ts";

export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [userThenable] = useQuery(assigneeQuery, props.handle);
	const user = use(userThenable);
	if (!user) {
		return null;
	}

	return <AssigneeCardView user={user} />;
}
