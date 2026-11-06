import {
	createQueryClient,
	ensureEntry,
	invalidateOne,
	load,
	QueryClientProvider,
	queryOptions,
	recommended,
} from "@raf-query/react";
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
// The TanStack Query screens read this as
// useQuery({ queryKey: ["post", slug], queryFn: () => getPost(slug) }).
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
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
// In an action on raf-query:
await invalidateOne(queryClient, postQuery, { slug });
// In code still on TanStack Query:
await tanstackQueryClient.invalidateQueries({ queryKey: ["post", slug] });
// #endregion

// #region filter
tanstackQuerySync(tanstackQueryClient, {
	filter: (queryKey) => queryKey[0] !== "session",
});
// #endregion
