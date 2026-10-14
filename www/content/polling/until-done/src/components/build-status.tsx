import { type QueryHandle, useQuery, useQueryClient } from "@raf-query/react";
import { use } from "react";

import { buildQuery } from "../queries";

export function BuildStatus(props: { handle: QueryHandle<typeof buildQuery> }) {
	const qc = useQueryClient();
	const buildState =
		qc.getData(buildQuery, props.handle.input)?.status ?? "pending";
	// #region interval
	const [buildPromise, build] = useQuery(buildQuery, props.handle, {
		refetchInterval: buildState === "running" ? 1000 : undefined,
	});
	// #endregion
	const status = use(buildPromise).status;
	return <p aria-busy={build.isFetching}>Build {status}</p>;
}
