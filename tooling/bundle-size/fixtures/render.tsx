import {
	group,
	load,
	prefetch,
	type QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { type ReactNode, Suspense, use } from "react";
import { createRoot } from "react-dom/client";

import { getIssue } from "./api.ts";

const issues = group("issues");

export const issueQuery = (input: { readonly id: number }) =>
	queryOptions({
		queryFn: () => getIssue(input.id),
		queryKey: issues(input.id),
	});

function IssueTitle(props: {
	readonly handle: QueryHandle<typeof issueQuery>;
}) {
	const [issueThenable] = useQuery(issueQuery, props.handle);
	const issue = use(issueThenable);
	return <h1>{issue.title}</h1>;
}

/**
 * Load one issue with `client` and render its title, inside `wrap`. Every
 * React fixture renders through this, so they differ only in the client's
 * links and features and the wrapper.
 */
export async function render(
	client: QueryClient,
	wrap: (children: ReactNode) => ReactNode = (children) => children,
) {
	const [handles] = await load(client, {
		issue: prefetch(issueQuery, { id: 1 }),
	});
	createRoot(document.body).render(
		<QueryClientProvider client={client}>
			<Suspense fallback="Loading">
				{wrap(<IssueTitle handle={handles.issue} />)}
			</Suspense>
		</QueryClientProvider>,
	);
}
