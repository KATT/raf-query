/**
 * The base (`hooks.tsx`), with `queryOptions` and `useQueryClient` bound to
 * the client's root the way an app's `raf.ts` binds them. Every binder
 * returns the one function behind it, so this bundle stays within a few
 * bytes of the base and holds no paging code.
 */
import {
	bindQueryOptions,
	bindUseQueryClient,
	createQueryClient,
	group,
	load,
	prefetch,
	QueryClientProvider,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";
import { createRoot } from "react-dom/client";

import { getIssue } from "./api.ts";

const makeQueryClient = () => createQueryClient();
const queryOptions = bindQueryOptions<typeof makeQueryClient>();
const useQueryClient = bindUseQueryClient<typeof makeQueryClient>();

const issues = group("issues");

const issueQuery = (input: { readonly id: number }) =>
	queryOptions({
		queryFn: () => getIssue(input.id),
		queryKey: issues(input.id),
	});

function IssueTitle(props: {
	readonly handle: QueryHandle<typeof issueQuery>;
}) {
	const client = useQueryClient();
	const [issueThenable] = useQuery(issueQuery, props.handle);
	const issue = use(issueThenable);
	return <h1 data-server={client.isServer}>{issue.title}</h1>;
}

const client = makeQueryClient();
const [handles] = await load(client, {
	issue: prefetch(issueQuery, { id: 1 }),
});
createRoot(document.body).render(
	<QueryClientProvider client={client}>
		<Suspense fallback="Loading">
			<IssueTitle handle={handles.issue} />
		</Suspense>
	</QueryClientProvider>,
);
