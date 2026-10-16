import { redirect } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

/** `/issues…` without a verb: the same page under `/prefetch`. */
export const GET: RequestHandler = (event) =>
	redirect(302, `/prefetch${event.url.pathname}${event.url.search}`);
