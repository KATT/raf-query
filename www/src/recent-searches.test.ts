import { describe, expect, it, vi } from "@effect/vitest";

import {
	parseRecent,
	readRecent,
	rememberRecent,
	withRecent,
	writeRecent,
} from "./recent-searches.ts";

describe("parseRecent", () => {
	it("reads the stored ids", () => {
		expect(parseRecent('["a","b#c"]')).toEqual(["a", "b#c"]);
	});

	it("reads nothing, or anything else, as none", () => {
		expect(parseRecent(null)).toEqual([]);
		expect(parseRecent("{")).toEqual([]);
		expect(parseRecent('{"a":1}')).toEqual([]);
		expect(parseRecent('["a",1,null]')).toEqual(["a"]);
	});
});

describe("withRecent", () => {
	it("puts the id first, once", () => {
		expect(withRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
		expect(withRecent([], "a")).toEqual(["a"]);
	});

	it("keeps the newest six", () => {
		expect(withRecent(["1", "2", "3", "4", "5", "6"], "7")).toEqual([
			"7",
			"1",
			"2",
			"3",
			"4",
			"5",
		]);
	});
});

describe("rememberRecent", () => {
	it("keeps the newest first", () => {
		const stored = new Map<string, string>();
		const storage: Pick<Storage, "getItem" | "removeItem" | "setItem"> = {
			getItem: (key) => stored.get(key) ?? null,
			removeItem: (key) => {
				stored.delete(key);
			},
			setItem: (key, value) => {
				stored.set(key, value);
			},
		};
		vi.stubGlobal("localStorage", storage);
		rememberRecent("caching");
		rememberRecent("retries");
		rememberRecent("caching#garbage-collection");
		rememberRecent("retries");
		expect(readRecent()).toEqual([
			"retries",
			"caching#garbage-collection",
			"caching",
		]);
		writeRecent([]);
		expect(stored.size).toBe(0);
	});

	it("reads none where storage throws", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("denied");
			},
		});
		expect(readRecent()).toEqual([]);
	});

	it("doesn't throw where storage won't write", () => {
		const denied = () => {
			throw new Error("denied");
		};
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			removeItem: denied,
			setItem: denied,
		});
		expect(() => {
			rememberRecent("caching");
		}).not.toThrow();
		expect(() => {
			writeRecent([]);
		}).not.toThrow();
	});
});
