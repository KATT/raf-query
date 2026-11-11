/**
 * Structural sharing. When an entry that has data gets new data (a
 * response, a stream chunk, `setData`), `write` passes both through
 * `replaceEqualDeep`: every part of the new data that deeply equals the
 * old keeps the old object, and fully equal data keeps the old value
 * itself, so its thenable and every memoized reader stay put. Only plain
 * objects and dense arrays are compared plugin by plugin, by own keys (a JSON
 * `"__proto__"` key stays data); anything else is replaced. The client's
 * `structuralSharing: false`, or a query's, turns it off.
 */
import { assert, asyncProperty, type JsonValue, jsonValue } from "fast-check";
import { describe, expect, it } from "vitest";

import {
	getData,
	load,
	revalidate,
	setData,
	waterfallHandle,
} from "../index.ts";
import {
	createBackend,
	issues,
	queryOptions,
	read,
	start,
	testClient,
} from "../test-utils.ts";

/** What these tests write with `setData`. */
type Data = Date | JsonValue | ReadonlyArray<number>;

const any = () =>
	queryOptions({ queryFn: (): Data => null, queryKey: issues("any") });

describe("structural sharing", () => {
	it("keeps unchanged data and its thenable across refetches", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		await backend.respondAll();
		const [thenable] = view.result.current;
		const data = getData(client, backend.issueQuery, { id: 1 });
		const [refetch] = await start(() => view.result.current[1].refetch());
		await backend.respondAll();
		await refetch;

		expect(view.result.current[0]).toBe(thenable);
		expect(getData(client, backend.issueQuery, { id: 1 })).toBe(data);
		backend.store.set(1, { author: "ada", id: 1, title: "New" });
		const [changed] = await start(() => view.result.current[1].refetch());
		await backend.respondAll();
		await changed;
		expect(view.result.current[0]).not.toBe(thenable);
		expect(view.result.current[0]).toMatchObject({ value: { title: "New" } });
	});

	it("replaces equal data when structural sharing is off, for the client or one query", async () => {
		const shared = (input: { readonly off?: boolean }) =>
			queryOptions({
				queryFn: () => ({ list: [1, 2] }),
				queryKey: issues("shared", input),
				structuralSharing: input.off ? false : undefined,
			});
		for (const [client, input] of [
			[testClient({ defaults: { structuralSharing: false } }), {}],
			[testClient(), { off: true }],
		] as const) {
			await load(client, { value: revalidate(shared, input) });
			const first = getData(client, shared, input);
			await load(client, { value: revalidate(shared, input) });

			expect(getData(client, shared, input)).not.toBe(first);
			expect(getData(client, shared, input)).toEqual(first);
		}
	});

	it("keeps the identity of every part of new data that equals the old", async () => {
		await assert(
			asyncProperty(jsonValue(), jsonValue(), async (previous, next) => {
				const client = testClient();
				setData(client, any, previous);
				setData(client, any, structuredClone(next));
				const written = getData(client, any);
				setData(client, any, structuredClone(next));

				expect(written).toEqual(next);
				expect(getData(client, any)).toBe(written);
			}),
			{
				// `jsonValue()` draws an own `"__proto__"` key in about one value
				// in 2000, so these run every time rather than when the seed hits.
				examples: [
					[{}, JSON.parse('{"__proto__":{}}')],
					[
						JSON.parse('{"__proto__":{"a":1}}'),
						JSON.parse('{"__proto__":{"a":1}}'),
					],
					[[JSON.parse('{"__proto__":null}')], [JSON.parse('{"__proto__":1}')]],
				],
			},
		);
		const client = testClient();
		const list = {
			a: { b: 1 },
			list: [{ id: 1 }, { id: 2 }],
		} satisfies JsonValue;
		setData(client, any, list);
		setData(client, any, {
			a: { b: 1 },
			list: [{ id: 1 }, { id: 3 }],
		});
		expect(getData(client, any)).toMatchObject({
			a: list.a,
			list: [list.list[0], { id: 3 }],
		});
	});

	it("keeps a `__proto__` key as data, as `JSON.parse` makes it", () => {
		const client = testClient();
		const previous: JsonValue = JSON.parse(
			'{"__proto__":{"admin":false},"id":1}',
		);
		setData(client, any, {});
		setData(client, any, previous);
		const written = getData(client, any);
		setData(client, any, JSON.parse('{"__proto__":{"admin":true},"id":1}'));
		const shared = getData(client, any);

		expect(written).toEqual(previous);
		expect(Object.getPrototypeOf(shared)).toBe(Object.prototype);
		expect(Object.getOwnPropertyDescriptor(shared, "__proto__")?.value).toEqual(
			{
				admin: true,
			},
		);
		expect(Object.hasOwn(Object.prototype, "admin")).toBe(false);
	});

	it("replaces data it can't compare part by part", () => {
		const client = testClient();
		// A list with a hole at 1, which structural sharing doesn't treat as plain.
		const sparse = (): Array<number> =>
			Object.assign([], { 0: 1, 2: 3, length: 3 });
		for (const [previous, next] of [
			[new Date(0), new Date(0)],
			[sparse(), sparse()],
			[{ a: undefined }, { b: undefined }],
		]) {
			setData(client, any, previous);
			setData(client, any, next);
			expect(getData(client, any)).not.toBe(previous);
			expect(getData(client, any)).toEqual(next);
		}
	});
});
