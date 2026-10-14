import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { buildQuery } from "../queries";

// #region build-status
function BuildStatus(props: { handle: QueryHandle<typeof buildQuery> }) {
	const [buildPromise, build] = useQuery(buildQuery, props.handle, {
		refetchInterval: 2000,
	});
	// ...
	// #endregion
	const status = use(buildPromise).status;
	return <p aria-busy={build.isFetching}>Build {status}</p>;
	// #region build-status
}
// #endregion

export { BuildStatus };
