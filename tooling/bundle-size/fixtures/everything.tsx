import {
	createQueryClient,
	type DehydratedState,
	HydrationBoundary,
	invalidateMany,
	recommended,
	timeout,
} from "@raf-query/react";

import { renderPages } from "./pages.tsx";
import { issueQuery, render } from "./render.tsx";

declare const state: DehydratedState;

const behaviors = recommended();
const client = createQueryClient({
	features: behaviors.features,
	links: [...behaviors.links, timeout(10_000)],
});
await render(client, (children) => (
	<HydrationBoundary state={state}>{children}</HydrationBoundary>
));
await renderPages(client);
document.addEventListener("click", () => {
	void invalidateMany(client, issueQuery, { id: 1 });
});
