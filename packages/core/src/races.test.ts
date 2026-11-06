import {
	type Arbitrary,
	array,
	assert,
	asyncProperty,
	constant,
	nat,
	oneof,
} from "fast-check";
import { describe, expect, it } from "vitest";

import { entryOf, fetchEntry, type Outcome, subscribeEntry } from "./entry.ts";
import { dehydrate, hydrate } from "./hydration.ts";
import { invalidateMany, removeMany, resetMany } from "./verbs.ts";
import { createBackend, flush, issues, testClient } from "./test-utils.ts";

type Step =
	| { readonly index: number; readonly kind: "fail" }
	| { readonly kind: "fetch" }
	| { readonly kind: "hydrate" }
	| { readonly kind: "invalidate" }
	| { readonly kind: "read" }
	| { readonly kind: "remove" }
	| { readonly kind: "reset" }
	| { readonly index: number; readonly kind: "respond" }
	| { readonly kind: "unread" };

const step: Arbitrary<Step> = oneof(
	constant({ kind: "fetch" as const }),
	constant({ kind: "hydrate" as const }),
	constant({ kind: "invalidate" as const }),
	constant({ kind: "read" as const }),
	constant({ kind: "remove" as const }),
	constant({ kind: "reset" as const }),
	constant({ kind: "unread" as const }),
	nat(3).map((index) => ({ index, kind: "fail" as const })),
	nat(3).map((index) => ({ index, kind: "respond" as const })),
);

describe("races", () => {
	it("end every request in data, an error or a cancellation, and never hang", async () => {
		await assert(
			asyncProperty(array(step, { maxLength: 25 }), async (steps) => {
				const backend = createBackend();
				const server = createBackend();
				const client = testClient();
				const serverClient = testClient({ isServer: true });
				const waits: Array<Promise<Outcome>> = [];
				const readers: Array<() => void> = [];
				const read = () => entryOf(client, backend.issueQuery, { id: 1 });
				for (const next of steps) {
					switch (next.kind) {
						case "fail":
							backend.requests
								.splice(next.index, 1)[0]
								?.fail(new Error("down"));
							break;
						case "fetch":
							waits.push(fetchEntry(read()));
							break;
						case "hydrate":
							void fetchEntry(
								entryOf(serverClient, server.issueQuery, { id: 1 }),
							);
							hydrate(client, dehydrate(serverClient));
							server.respondAll();
							break;
						case "invalidate":
							void invalidateMany(client, issues);
							break;
						case "read":
							readers.push(subscribeEntry(read(), () => {}));
							break;
						case "remove":
							removeMany(client, issues);
							break;
						case "reset":
							void resetMany(client, issues);
							break;
						case "respond":
							backend.requests.splice(next.index, 1)[0]?.respond();
							break;
						case "unread":
							readers.pop()?.();
							break;
					}
					await flush();
				}
				for (let round = 0; round < 5; round++) {
					backend.respondAll();
					server.respondAll();
					await flush();
				}
				const outcomes = await Promise.all(waits);
				const entry = read();

				for (const outcome of outcomes) {
					expect(outcome.ok || outcome.error).toBeTruthy();
				}
				expect(entry.state.isFetching).toBe(false);
				expect(entry.run).toBeUndefined();
				if (entry.state.hasData) {
					expect(entry.thenable.status).toBe("fulfilled");
				}
				if (entry.state.status === "error") {
					expect(String(entry.state.error)).toMatch(/down/);
				}
			}),
			{ numRuns: 200 },
		);
	});
});
