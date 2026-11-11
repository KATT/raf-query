interface Incident {
	readonly id: string;
	readonly title: string;
}

declare function listIncidents(init: {
	signal: AbortSignal;
}): Promise<ReadonlyArray<Incident>>;

// #region any-client
import { bindQueryOptions, group } from "@raf-query/react";

// No type argument: the builder takes the core's options only, and its
// factories run on any client.
const queryOptions = bindQueryOptions();

const status = group("status-page");

export function incidentsQuery() {
	return queryOptions({
		queryKey: status("incidents"),
		queryFn: ({ signal }) => listIncidents({ signal }),
		staleTime: 60_000,
	});
}

queryOptions({
	queryKey: status("incidents", "retried"),
	queryFn: ({ signal }) => listIncidents({ signal }),
	// @ts-expect-error -- 2769: `retry` is an option of `retry()`, which this builder doesn't name
	retry: 1,
});
// #endregion
