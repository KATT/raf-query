/**
 * Streams live in the kernel (`entry.ts`, `pump`), so every bundle has
 * them. When a request's result is an async iterable and the options have
 * `stream: { initial, reduce }`, the entry folds each chunk into the data
 * with `reduce` and writes it, and the request counts as settled at the
 * first chunk: loads and readers resume there while later chunks keep
 * updating the cache. A stream that ends without a chunk writes `initial`;
 * one that throws keeps the chunks it wrote, and fails only if it wrote
 * none. A restarted or removed entry ignores the old stream's chunks.
 */
import { describe, expect, it } from "vitest";

import {
	getData,
	invalidateOne,
	part,
	load,
	queryOptions,
	removeOne,
	swr,
	waterfallHandle,
} from "./index.ts";
import { flush, issues, read, testClient } from "./test-utils.ts";

type Chunk = number | Error | undefined;

/** A stream of the numbers it is sent, summed into the data. Each run buffers what it is sent. */
function source() {
	const runs: Array<Array<Chunk>> = [];
	const wakes = new Set<() => void>();
	async function* stream(sent: Array<Chunk>) {
		for (;;) {
			while (sent.length === 0) {
				// oxlint-disable-next-line no-await-in-loop -- wait for the next send
				await new Promise<void>((resolve) => wakes.add(resolve));
			}
			const next = sent.shift();
			if (next === undefined) {
				return;
			}
			if (next instanceof Error) {
				throw next;
			}
			yield next;
		}
	}
	const sum = () =>
		queryOptions({
			queryFn: () => {
				const sent: Array<Chunk> = [];
				runs.push(sent);
				return stream(sent);
			},
			queryKey: issues("sum"),
			stream: {
				initial: 0,
				reduce: (total: number, chunk: number) => total + chunk,
			},
		});
	/** Send a chunk, an error, or (with nothing) the end to every stream so far. */
	const push = async (next?: Chunk) => {
		for (const sent of runs) {
			sent.push(next);
		}
		for (const wake of wakes) {
			wake();
		}
		wakes.clear();
		await flush();
	};
	return { push, runs, sum };
}

describe("a streamed query", () => {
	it("is ready at its first chunk, and folds every later chunk into the data", async () => {
		const stream = source();
		const client = testClient();
		const loading = load(client, { sum: swr(stream.sum) });
		await stream.push(2);
		const [handles] = await loading;
		const view = read(client, stream.sum, handles.sum);

		expect(view.result.current[0]).toMatchObject({ value: 2 });
		expect(view.result.current[1].isFetching).toBe(true);
		await stream.push(3);
		expect(view.result.current[0]).toMatchObject({ value: 5 });
		await stream.push();
		expect(view.result.current[1].isFetching).toBe(false);
	});

	it("holds its initial data when it ends without a chunk", async () => {
		const stream = source();
		const client = testClient();
		const view = read(client, stream.sum, waterfallHandle(stream.sum));
		await stream.push();

		expect(view.result.current[0]).toMatchObject({ value: 0 });
		expect(view.result.current[1].isFetching).toBe(false);
	});

	it("keeps the chunks it got when it breaks, and fails when it got none", async () => {
		const stream = source();
		const client = testClient();
		const view = read(client, stream.sum, waterfallHandle(stream.sum));
		await stream.push(4);
		await stream.push(new Error("cut"));

		expect(view.result.current[0]).toMatchObject({ value: 4 });
		expect(view.result.current[1]).toMatchObject({
			error: new Error("cut"),
			isFetching: false,
		});
		const other = source();
		const failed = load(testClient(), { sum: swr(other.sum) }).catch(
			(error: unknown) => error,
		);
		await other.push(new Error("refused"));
		expect(await failed).toEqual(new Error("refused"));
	});

	it("drops what a removed stream sends later", async () => {
		const client = testClient();
		for (const late of [7, new Error("late"), undefined]) {
			const stream = source();
			const loading = load(client, { sum: swr(stream.sum) });
			// oxlint-disable-next-line no-await-in-loop -- one stream at a time
			await stream.push(1);
			// oxlint-disable-next-line no-await-in-loop -- one stream at a time
			await loading;
			removeOne(client, stream.sum);
			// oxlint-disable-next-line no-await-in-loop -- one stream at a time
			await stream.push(late);

			expect(getData(client, stream.sum)).toBeUndefined();
		}
	});

	it("restarts on invalidation, and drops the old stream's chunks", async () => {
		const stream = source();
		const client = testClient();
		const view = read(client, stream.sum, waterfallHandle(stream.sum));
		await stream.push(1);
		void invalidateOne(client, stream.sum);
		await flush();
		await stream.push(10);

		expect(stream.runs).toHaveLength(2);
		expect(view.result.current[0]).toMatchObject({ value: 10 });
	});

	it("takes a link's answer that isn't a stream as it is", async () => {
		const stream = source();
		const client = testClient({
			parts: [part({ link: async () => 42 })],
		});
		const [, data] = await load(client, { sum: swr(stream.sum) });

		expect(data.sum).toBe(42);
		expect(stream.runs).toHaveLength(0);
	});
});
