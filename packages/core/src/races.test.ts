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

import { dehydrate, hydrate } from "./hydration.ts";
import {
	invalidateMany,
	isFetching,
	load,
	prefetch,
	removeMany,
	resetMany,
	revalidate,
	waterfallHandle,
} from "./index.ts";
import {
	createBackend,
	flush,
	issues,
	read,
	testClient,
} from "./test-utils.ts";

type Step =
	| { readonly index: number; readonly kind: "fail" }
	| { readonly kind: "hydrate" }
	| { readonly kind: "invalidate" }
	| { readonly kind: "load" }
	| { readonly kind: "read" }
	| { readonly kind: "remove" }
	| { readonly kind: "reset" }
	| { readonly index: number; readonly kind: "respond" }
	| { readonly kind: "unread" };

const step: Arbitrary<Step> = oneof(
	constant({ kind: "hydrate" as const }),
	constant({ kind: "invalidate" as const }),
	constant({ kind: "load" as const }),
	constant({ kind: "read" as const }),
	constant({ kind: "remove" as const }),
	constant({ kind: "reset" as const }),
	constant({ kind: "unread" as const }),
	nat(3).map((index) => ({ index, kind: "fail" as const })),
	nat(3).map((index) => ({ index, kind: "respond" as const })),
);

describe("racing loads, reads, invalidations and removals", () => {
	it("end every request in data, an error or a cancellation, and never hang", async () => {
		await assert(
			asyncProperty(array(step, { maxLength: 25 }), async (steps) => {
				const backend = createBackend();
				const server = createBackend();
				const client = testClient();
				const handle = waterfallHandle(backend.issueQuery, { id: 1 });
				const loads: Array<Promise<unknown>> = [];
				const readers: Array<ReturnType<typeof read>> = [];
				for (const next of steps) {
					switch (next.kind) {
						case "fail":
							backend.requests
								.splice(next.index, 1)[0]
								?.fail(new Error("down"));
							break;
						case "hydrate": {
							const serverClient = testClient({ isServer: true });
							void load(serverClient, {
								issue: prefetch(server.issueQuery, { id: 1 }),
							});
							hydrate(client, dehydrate(serverClient));
							for (const request of server.requests.splice(0)) {
								request.respond();
							}
							break;
						}
						case "invalidate":
							void invalidateMany(client, issues);
							break;
						case "load":
							loads.push(
								load(client, {
									issue: revalidate(backend.issueQuery, { id: 1 }),
								}).catch((error: unknown) => error),
							);
							break;
						case "read":
							readers.push(read(client, backend.issueQuery, handle));
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
							readers.pop()?.unmount();
							break;
					}
					// oxlint-disable-next-line no-await-in-loop -- steps run in order
					await flush();
				}
				for (let round = 0; round < 5; round++) {
					// oxlint-disable-next-line no-await-in-loop -- until nothing is left
					await backend.respondAll();
				}
				const ended = await Promise.all(loads);
				const last = read(client, backend.issueQuery, handle);
				await backend.respondAll();
				const [thenable, controls] = last.result.current;

				for (const outcome of ended) {
					expect(
						Array.isArray(outcome) ||
							String(outcome).match(/down|AbortError|cancelled/),
					).toBeTruthy();
				}
				expect(isFetching(client)).toBe(0);
				expect(thenable.status).not.toBe("pending");
				if (controls.error !== undefined) {
					expect(String(controls.error)).toMatch(/down/);
				}
				for (const reader of [...readers, last]) {
					reader.unmount();
				}
			}),
			{ numRuns: 100 },
		);
	});
});
