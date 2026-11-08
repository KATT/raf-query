import {
	group,
	load,
	prefetch,
	type QueryClient,
	type QueryHandle,
	queryOptions,
	skipToken,
	swr,
	useQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";
import { postQuery } from "~/queries.ts";

const drafts = group("drafts");

interface Draft {
	readonly id: string;
	readonly title: string;
}

declare function listDrafts(slug: string): Promise<ReadonlyArray<Draft>>;

function draftsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: drafts(input.slug),
		queryFn: () => listDrafts(input.slug),
	});
}

declare const queryClient: QueryClient;

declare const user: { readonly isAdmin: boolean };

declare function DraftList(props: {
	readonly drafts: ReadonlyArray<Draft>;
}): React.ReactNode;

// #region loader
async function loader(slug: string) {
	const [handles] = await load(queryClient, {
		post: swr(postQuery, { slug }),
		// Only admins see drafts: for everyone else, nothing starts.
		drafts: user.isAdmin ? prefetch(draftsQuery, { slug }) : skipToken,
	});
	handles.drafts;
	//      ^?
	return handles;
}
// #endregion loader

declare const loaderData: Awaited<ReturnType<typeof loader>>;

// #region component
function PostSidebar() {
	const draftsHandle = loaderData.drafts;
	if (!draftsHandle) {
		return null;
	}
	return (
		<Suspense fallback={<p>Loading drafts…</p>}>
			<Drafts handle={draftsHandle} />
		</Suspense>
	);
}

function Drafts(props: { handle: QueryHandle<typeof draftsQuery> }) {
	const [draftsThenable] = useQuery(draftsQuery, props.handle);
	return <DraftList drafts={use(draftsThenable)} />;
}
// #endregion component

export { PostSidebar };
