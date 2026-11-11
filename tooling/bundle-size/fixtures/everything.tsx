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

const client = createQueryClient({
	parts: [...recommended(), timeout(10_000)],
});
await render(client, (children) => (
	<HydrationBoundary state={state}>{children}</HydrationBoundary>
));
await renderPages(client);
document.addEventListener("click", () => {
	void invalidateMany(client, issueQuery, { id: 1 });
});
