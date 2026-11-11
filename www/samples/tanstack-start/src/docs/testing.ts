import {
	type Clock,
	createQueryClient,
	getData,
	load,
	recommended,
	setData,
	swr,
} from "@raf-query/react";
import { expect, test } from "./testing.vitest.ts";
import type { Post } from "~/api.ts";
import { postQuery } from "~/queries.ts";

// #region seeding-the-cache
const queryClient = createQueryClient({
	isServer: false,
	plugins: recommended(),
	defaults: { staleTime: Number.POSITIVE_INFINITY },
});

setData(
	queryClient,
	postQuery,
	{ slug: "hello" },
	{ slug: "hello", title: "Hello", body: "", authorId: "" },
);
const [handles] = await load(queryClient, {
	post: swr(postQuery, { slug: "hello" }),
});
// #endregion

declare const server: {
	use(...handlers: ReadonlyArray<unknown>): void;
};

declare const http: {
	get(path: string, resolver: () => unknown): unknown;
};

declare const HttpResponse: {
	json(body: unknown): unknown;
};

// #region mocking-the-network
server.use(
	http.get("/api/posts/:slug", () =>
		HttpResponse.json({ slug: "hello", title: "Hello" }),
	),
);
// #endregion

// #region time
// ---collapse---
interface Timer {
	readonly at: number;
	readonly callback: () => void;
}

/** A clock whose timers fire only when the test advances it. */
function fakeClock(): Clock & { advance(ms: number): void } {
	let now = 0;
	let timers: Array<Timer> = [];
	return {
		now: () => now,
		setTimeout(callback, ms) {
			const timer: Timer = { at: now + ms, callback };
			timers.push(timer);
			return timer;
		},
		clearTimeout(handle) {
			timers = timers.filter((timer) => timer !== handle);
		},
		advance(ms) {
			const end = now + ms;
			for (;;) {
				const due = timers
					.filter((timer) => timer.at <= end)
					.toSorted((a, b) => a.at - b.at)[0];
				if (!due) break;
				timers = timers.filter((timer) => timer !== due);
				now = due.at;
				due.callback();
			}
			now = end;
		},
	};
}
// ---/collapse---

test("garbage-collects unread entries", () => {
	const clock = fakeClock();
	const queryClient = createQueryClient({
		clock,
		isServer: false,
		plugins: recommended(),
	});
	const post: Post = {
		slug: "hello",
		title: "Hello",
		body: "",
		authorId: "ada",
	};

	setData(queryClient, postQuery, { slug: "hello" }, post);
	clock.advance(5 * 60 * 1000); // the default gcTime

	expect(getData(queryClient, postQuery, { slug: "hello" })).toBeUndefined();
});
// #endregion
