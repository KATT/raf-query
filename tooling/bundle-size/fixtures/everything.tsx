import { QueryBoundary } from "@raf-query/boundary";
import {
	createQueryClient,
	HydrationBoundary,
	invalidateMany,
	recommended,
	timeout,
} from "@raf-query/react";
import { groups, tag } from "@raf-query/react/groups";
import type { DehydratedState } from "@raf-query/react/hydration";

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
document.addEventListener("click", () => {
	void invalidateMany(client, author, "ada");
});
