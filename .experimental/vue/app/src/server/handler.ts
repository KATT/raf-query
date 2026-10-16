import { app as api } from "@examples/api";
import { Hono } from "hono";

import { type Assets, renderPage } from "./render.ts";

/** The API at `/api/*`, and every other `GET` rendered as a page. */
export function createHandler(assets: Assets) {
	return new Hono()
		.all("/api/*", (c) => api.fetch(c.req.raw))
		.get("*", (c) => renderPage(c.req.raw, assets));
}

export type CreateHandler = typeof createHandler;
