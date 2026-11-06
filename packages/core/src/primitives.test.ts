import {
	assert,
	dictionary,
	integer,
	jsonValue,
	property,
	string,
} from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { systemClock } from "./client.ts";
import { fail, failOf, isFail, QueryFailure } from "./fail.ts";
import { hashKey, matches, stampFor } from "./keys.ts";
import { replaceEqualDeep } from "./share.ts";
import { listeners } from "./subscribe.ts";
import {
	fulfilled,
	mapThenable,
	pending,
	rejected,
	type Thenable,
} from "./thenable.ts";
import { author, drafts, featured, issues } from "./test-utils.ts";

describe("thenables", () => {
	it("map settled thenables synchronously, and cache per source", async () => {
		const cache = new WeakMap<Thenable<unknown>, Thenable<unknown>>();
		const source = fulfilled(2);
		const doubled = mapThenable(cache, source, (value) => value * 2);

		expect(doubled).toMatchObject({ status: "fulfilled", value: 4 });
		expect(mapThenable(cache, source, (value) => value * 2)).toBe(doubled);
		const failed = mapThenable(cache, rejected<number>("no"), (value) => value);
		expect(failed).toMatchObject({ reason: "no", status: "rejected" });
	});

	it("map pending thenables when they settle", async () => {
		const cache = new WeakMap<Thenable<unknown>, Thenable<unknown>>();
		const ok = pending<number>();
		const bad = pending<number>();
		const mapped = mapThenable(cache, ok.promise, (value) => value + 1);
		const mappedBad = mapThenable(cache, bad.promise, (value) => value + 1);

		expect(mapped.status).toBe("pending");
		ok.resolve(1);
		bad.reject("no");
		await expect(mapped).resolves.toBe(2);
		await expect(mappedBad).rejects.toBe("no");
		expect(mappedBad).toMatchObject({ reason: "no", status: "rejected" });
	});
});

const json = jsonValue();

describe("replaceEqualDeep", () => {
	it("returns a value equal to the next one", () => {
		assert(
			property(json, json, (previous, next) => {
				expect(replaceEqualDeep(previous, next)).toEqual(next);
			}),
		);
	});

	it("keeps the previous value when the next is deeply equal", () => {
		assert(
			property(json, (value) => {
				expect(replaceEqualDeep(value, structuredClone(value))).toBe(value);
			}),
		);
	});

	it("reuses unchanged parts", () => {
		const previous = { a: { b: 1 }, list: [{ id: 1 }, { id: 2 }] };
		const next = replaceEqualDeep(previous, {
			a: { b: 1 },
			list: [{ id: 1 }, { id: 3 }],
		});

		expect(next).toEqual({ a: { b: 1 }, list: [{ id: 1 }, { id: 3 }] });
		expect(next).toMatchObject({ a: previous.a });
		expect(replaceEqualDeep({ a: 1 }, { b: 1 })).toEqual({ b: 1 });
		expect(replaceEqualDeep(new Date(0), new Date(0))).not.toBe(new Date(0));
	});
});

describe("keys", () => {
	it("hash the same however fields are ordered", () => {
		assert(
			property(dictionary(string(), integer()), (input) => {
				const reversed = Object.fromEntries(Object.entries(input).toReversed());

				expect(hashKey([issues, "list", reversed])).toBe(
					hashKey([issues, "list", input]),
				);
			}),
		);
	});

	it("make groups plain, frozen data that survives any serializer", () => {
		const key = [drafts, "list"] as const;
		expect(drafts).toEqual({ group: "issues/drafts" });
		expect(Object.isFrozen(drafts)).toBe(true);
		expect(hashKey(key)).toBe('[{"group":"issues/drafts"},"list"]');
		expect(structuredClone(key)).toEqual(key);
	});

	it("match a factory's input by its parts, arrays included", () => {
		const factory = () => ({ queryKey: [issues, "list"] as const });
		const entry = {
			factory,
			hash: "",
			input: undefined,
			key: [issues, "list", { ids: [1, 2], status: "open" }] as const,
			options: undefined,
			state: { data: undefined },
		};

		expect(matches(entry, stampFor(factory, { ids: [1, 2] }, 1))).toBe(true);
		expect(matches(entry, stampFor(factory, { ids: [1] }, 1))).toBe(false);
		expect(matches(entry, stampFor(factory, { ids: [1, 3] }, 1))).toBe(false);
		expect(matches(entry, stampFor(factory, { status: "closed" }, 1))).toBe(
			false,
		);
	});

	it("make typed tags", () => {
		expect(featured()).toBe("featured");
		expect(author("ada")).toBe('author:"ada"');
		expect(author.tag).toBe("author");
	});

	it("match groups by path prefix", () => {
		const keyed = (key: ReadonlyArray<unknown>) => ({
			factory: undefined,
			hash: "",
			input: undefined,
			key,
			options: undefined,
			state: { data: undefined },
		});
		const covers = (key: ReadonlyArray<unknown>, target: typeof issues) =>
			matches(keyed(key), stampFor(target, undefined, 1));

		expect(covers([drafts], drafts)).toBe(true);
		expect(covers([{ group: "issues/drafts" }], issues)).toBe(true);
		expect(covers([issues], drafts)).toBe(false);
		expect(covers([{ group: "issues-archive" }], issues)).toBe(false);
		expect(covers(["issues"], issues)).toBe(false);
		expect(covers([], issues)).toBe(false);
	});

	it("match tags by name", () => {
		const info = (
			tags?: ReadonlyArray<string> | (() => ReadonlyArray<string>),
		) => ({ data: undefined, input: undefined, meta: { tags }, queryKey: [] });
		expect(author.where(info(['author:"ada"']), undefined)).toBe(true);
		expect(author.where(info(["authors"]), undefined)).toBe(false);
		expect(featured.where(info(["featured"]), undefined)).toBe(true);
		expect(
			author.where(
				info(() => ["author"]),
				undefined,
			),
		).toBe(false);
	});
});

describe("fail", () => {
	it("recognizes fail() values, wrapped or not", () => {
		const value = fail({ _tag: "NotFound" });
		const wrapped = new QueryFailure(value, "hash");

		expect(isFail(value)).toBe(true);
		expect(isFail(value, "NotFound")).toBe(true);
		expect(isFail(wrapped, "Other")).toBe(false);
		expect(isFail(new Error("no"))).toBe(false);
		expect(failOf(wrapped)).toBe(value);
		expect(failOf(value)).toBe(value);
		expect(failOf(null)).toBeUndefined();
		expect(wrapped.message).toBe("Query hash failed: NotFound");
	});
});

describe("listeners", () => {
	it("unsubscribe by signal or by the returned function", () => {
		const seen: Array<number> = [];
		const sizes: Array<number> = [];
		const events = listeners<number>((size) => sizes.push(size));
		const controller = new AbortController();
		events.subscribe((event) => seen.push(event), {
			signal: controller.signal,
		});
		const unsubscribe = events.subscribe((event) => seen.push(event * 10));
		events.emit(1);
		controller.abort();
		unsubscribe();
		unsubscribe();
		events.emit(2);
		events.subscribe(() => {}, { signal: controller.signal })();

		expect(seen).toEqual([1, 10]);
		expect(sizes).toEqual([1, 2, 1, 0]);
	});
});

describe("systemClock", () => {
	it("uses the real timers", async () => {
		vi.useFakeTimers();
		const fired: Array<string> = [];
		systemClock.setTimeout(() => fired.push("a"), 10);
		const handle = systemClock.setTimeout(() => fired.push("b"), 10);
		systemClock.clearTimeout(handle);
		vi.advanceTimersByTime(10);

		expect(fired).toEqual(["a"]);
		expect(systemClock.now()).toBe(Date.now());
		vi.useRealTimers();
	});
});
