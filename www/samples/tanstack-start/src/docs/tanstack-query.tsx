import {
	createQueryClient,
	ensureEntry,
	invalidateMany,
	load,
	QueryClientProvider,
	queryOptions,
	recommended,
} from "@raf-query/react";
import { group } from "@raf-query/react/groups";
import { tanstackQuerySync } from "@raf-query/react/tanstack-query";
import {
	QueryClient,
	QueryClientProvider as TanStackQueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getPost } from "~/api.ts";

// #region setup
export function makeQueryClients() {
	const tanstackQueryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: 30_000 } },
	});
	const { features, links } = recommended();
	const queryClient = createQueryClient({
		links,
		features: [...features, tanstackQuerySync(tanstackQueryClient)],
		staleTime: 30_000,
	});
	return { queryClient, tanstackQueryClient };
}

export function Providers(props: {
	clients: ReturnType<typeof makeQueryClients>;
	children: ReactNode;
}) {
	return (
		<TanStackQueryClientProvider client={props.clients.tanstackQueryClient}>
			<QueryClientProvider client={props.clients.queryClient}>
				{props.children}
			</QueryClientProvider>
		</TanStackQueryClientProvider>
	);
}
// #endregion

const { queryClient, tanstackQueryClient } = makeQueryClients();
declare const slug: string;

// #region same-key
export const posts = group("posts");

// The TanStack Query screens read this as
// useQuery({ queryKey: ["posts", "detail", slug], queryFn: () => getPost(slug) }).
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("detail", input.slug),
		queryFn: () => getPost(input.slug),
	});
}
// #endregion

// #region loader
const [handles, data] = await load(queryClient, {
	post: ensureEntry(postQuery, { slug }),
});
// #endregion

// #region invalidate
// In an action on raf-query: every key that starts with "posts".
await invalidateMany(queryClient, posts);
// In code still on TanStack Query, the same queries:
await tanstackQueryClient.invalidateQueries({ queryKey: ["posts"] });
// #endregion

// #region filter
tanstackQuerySync(tanstackQueryClient, {
	filter: (queryKey) => queryKey[0] !== "session",
});
// #endregion
