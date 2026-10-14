/* oxlint-disable react-hooks/rules-of-hooks -- sample shows `useQuery` beside `ensure` */
import { QueryClient, queryOptions, useQuery } from "@raf-query/react";

import { api, call, type Endpoint } from "./api-client";

const slug = "hello-world";
const qc = new QueryClient({ isServer: true });

// #region makers
function endpointQuery<TArgs, TData>(endpoint: Endpoint<TArgs, TData>) {
	return (args: TArgs) =>
		queryOptions({
			queryKey: [endpoint.name, args],
			queryFn: (): Promise<TData> => call(endpoint, args),
		});
}

const post = await qc.ensure(endpointQuery(api.posts.get), { slug });
const [data] = useQuery(endpointQuery(api.posts.get), post);
// #endregion

export { data, endpointQuery, post };
