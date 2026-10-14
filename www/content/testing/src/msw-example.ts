import { http, HttpResponse } from "msw";

declare const server: {
	use(...handlers: ReadonlyArray<unknown>): void;
};

// #region msw
server.use(
	http.get("/api/posts/:slug", () =>
		HttpResponse.json({ slug: "hello", title: "Hello" }),
	),
);
// #endregion
