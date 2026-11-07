import {
	type Clock,
	createQueryClient,
	ensureEntry,
	getData,
	load,
	setData,
} from "@raf-query/react";
import { expect, test } from "./testing.vitest.ts";
import type { Todo } from "~/api.ts";
import { postQuery, todoQuery } from "~/queries.ts";

// #region seeding-the-cache
const queryClient = createQueryClient({
	isServer: false,
	staleTime: Number.POSITIVE_INFINITY,
});

setData(
	queryClient,
	postQuery,
	{ slug: "hello" },
	{ slug: "hello", title: "Hello", body: "", authorId: "" },
);
const [handles] = await load(queryClient, {
	post: ensureEntry(postQuery, { slug: "hello" }),
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
	const queryClient = createQueryClient({ clock, isServer: false });
	const todo: Todo = { id: 1, title: "Write tests", done: false };

	setData(queryClient, todoQuery, { id: 1 }, todo);
	clock.advance(5 * 60 * 1000); // the default gcTime

	expect(getData(queryClient, todoQuery, { id: 1 })).toBeUndefined();
});
// #endregion
