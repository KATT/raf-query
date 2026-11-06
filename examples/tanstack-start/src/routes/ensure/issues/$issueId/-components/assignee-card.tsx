import { AssigneeCardView } from "@examples/kit/components/user";
import { type DefinedQueryHandle, useQuery } from "@raf-query/react";

import { assigneeQuery } from "~/queries.ts";

export function AssigneeCard(props: {
	readonly handle: DefinedQueryHandle<typeof assigneeQuery>;
}) {
	const [user] = useQuery(assigneeQuery, props.handle);
	if (!user) {
		return null;
	}

	return <AssigneeCardView user={user} />;
}
