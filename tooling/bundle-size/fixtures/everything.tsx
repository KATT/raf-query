import { QueryBoundary } from "@raf-query/boundary";
import {
	createQueryClient,
	type DehydratedState,
	groups,
	HydrationBoundary,
	invalidateMany,
	recommended,
	tag,
	timeout,
} from "@raf-query/react";

import { renderPages } from "./pages.tsx";
import { issueQuery, render } from "./render.tsx";

declare const state: DehydratedState;

const author = tag<string>("author");
const behaviors = recommended();
const client = createQueryClient({
	features: [...behaviors.features, groups()],
	links: [...behaviors.links, timeout(10_000)],
});
await render(client, (children) => (
	<HydrationBoundary state={state}>
		<QueryBoundary fallback="Loading" query={issueQuery}>
			{children}
		</QueryBoundary>
	</HydrationBoundary>
));
await renderPages(client);
document.addEventListener("click", () => {
	void invalidateMany(client, author, "ada");
});
