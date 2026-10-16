import { app } from "@examples/api";

import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = (event) => app.fetch(event.request);
