import {
	createQueryClient,
	type DehydratedState,
	HydrationBoundary,
} from "@raf-query/react";

import { render } from "./render.tsx";

/** What the server sent, as a framework hands it to the page. */
declare const state: DehydratedState;

await render(createQueryClient(), (children) => (
	<HydrationBoundary state={state}>{children}</HydrationBoundary>
));
