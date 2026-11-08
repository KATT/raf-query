import {
	createQueryClient,
	focusRefetch,
	load,
	prefetch,
	type QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	removeAll,
	revalidate,
	useQuery,
} from "@raf-query/react";
import { act, render, screen } from "@testing-library/react";
import { type ReactNode, Suspense, use } from "react";
import { afterEach, beforeEach, expect, test } from "./testing.vitest.ts";
import { postQuery, posts } from "~/queries.ts";

declare function Post(props: {
	handle: QueryHandle<typeof postQuery>;
}): ReactNode;

// #region a-client-per-test
let queryClient: QueryClient;

beforeEach(() => {
	queryClient = createQueryClient({ isServer: false });
});

afterEach(() => {
	removeAll(queryClient);
});

function renderWithClient(ui: ReactNode) {
	return act(async () =>
		render(
			<QueryClientProvider client={queryClient}>
				<Suspense fallback="Loading…">{ui}</Suspense>
			</QueryClientProvider>,
		),
	);
}
// #endregion

// #region testing-a-component
test("shows the post", async () => {
	const [handles] = await load(queryClient, {
		post: prefetch(postQuery, { slug: "hello" }),
	});

	await renderWithClient(<Post handle={handles.post} />);

	expect((await screen.findByRole("heading")).textContent).toBe("Hello");
});
// #endregion

// #region focus-and-the-network
test("refetches on focus", async () => {
	let calls = 0;
	const viewsQuery = () =>
		queryOptions({ queryKey: posts("views"), queryFn: async () => ++calls });
	function Views(props: { handle: QueryHandle<typeof viewsQuery> }) {
		const [viewsThenable] = useQuery(viewsQuery, props.handle);
		const views = use(viewsThenable);
		return <p>{views} views</p>;
	}

	queryClient = createQueryClient({
		isServer: false,
		features: [focusRefetch()],
	});
	const [handles] = await load(queryClient, {
		views: revalidate(viewsQuery),
	});
	await renderWithClient(<Views handle={handles.views} />);

	await act(async () => {
		window.dispatchEvent(new Event("focus"));
	});
	expect(calls).toBe(2);
});
// #endregion
