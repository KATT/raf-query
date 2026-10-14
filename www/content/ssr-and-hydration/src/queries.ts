import { queryOptions } from "@raf-query/react";

import { detectPushState } from "./push";

export function pushStateQuery(input: { channel: string }) {
	return queryOptions({
		queryKey: ["pushState", input.channel],
		queryFn: () => detectPushState(input.channel),
		ssr: false,
	});
}
