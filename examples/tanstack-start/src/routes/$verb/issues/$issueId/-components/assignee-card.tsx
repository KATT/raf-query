import { AssigneeCardView } from "@examples/kit/components/user";
import type { QueryHandle } from "@raf-query/react";

import { useQueryData } from "~/loader-verb.ts";
import { assigneeQuery } from "~/queries.ts";

export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [user] = useQueryData(assigneeQuery, props.handle);
	if (!user) {
		return null;
	}

	return <AssigneeCardView user={user} />;
}
