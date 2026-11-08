import { describe, expect, it } from "@effect/vitest";

import {
	entriesById,
	groupBySection,
	highlight,
	noText,
	sameWord,
	type SearchableDoc,
	type SearchEntry,
	searchDocs,
	type SearchMatch,
	type SearchText,
	snippetOf,
} from "./search.ts";

const docs: ReadonlyArray<SearchableDoc> = [
	{
		description: "Mark queries stale and refetch the ones on screen.",
		headings: [
			{ depth: 2, id: "after-a-mutation", text: "After a mutation" },
			{ depth: 3, id: "by-filter", text: "By filter" },
		],
		section: "Guides",
		slug: "query-invalidation",
		title: "Query invalidation",
	},
	{
		description: "Failed requests retry with backoff.",
		headings: [{ depth: 2, id: "retry-delay", text: "retryDelay" }],
		section: "Guides",
		slug: "retries",
		title: "Retries",
	},
	{
		description: "Functions of one input that return a query's options.",
		headings: [{ depth: 2, id: "query-options", text: "queryOptions()" }],
		section: "Guides",
		slug: "query-factories",
		title: "Query factories",
	},
	{
		description: "How TanStack Query's APIs map onto raf-query.",
		headings: [{ depth: 2, id: "api-map", text: "API map" }],
		section: "Getting started",
		slug: "comparison",
		title: "Coming from TanStack Query",
	},
];

const text: SearchText = {
	comparison: "raf-query's cache is modelled on TanStack Query's.",
	"query-invalidation#by-filter":
		"Pass a filter to invalidate every query whose key starts with a prefix, and the cache refetches those a component reads.",
	retries: "A query that throws is retried three times before it fails.",
};

const ids = (query: string) =>
	searchDocs(docs, text, query, 20).map((hit) => hit.entry.id);

const marked = (value: string, match: SearchMatch) =>
	highlight(value, match)
		.filter((run) => run.marked)
		.map((run) => run.text);

const hitOf = (query: string, id: string) => {
	const hit = searchDocs(docs, text, query, 20).find(
		(one) => one.entry.id === id,
	);
	if (!hit) {
		throw new Error(`"${query}" doesn't find ${id}`);
	}
	return hit;
};

const matchOf = (query: string, id: string) => hitOf(query, id).match;

describe("searchDocs", () => {
	it("lists the first pages for an empty query", () => {
		expect(ids("")).toEqual([
			"query-invalidation",
			"retries",
			"query-factories",
			"comparison",
		]);
	});

	it("finds by prefix and with a typo", () => {
		expect(ids("mutat")).toContain("query-invalidation#after-a-mutation");
		expect(ids("mutaton")[0]).toBe("query-invalidation#after-a-mutation");
		expect(ids("rettries")).toContain("retries");
	});

	it("takes no typo in a word of three letters", () => {
		expect(ids("aip")).toEqual([]);
		expect(ids("mpa")).toEqual([]);
	});

	it("finds every word of a query, inside camelCase too", () => {
		expect(ids("query options")[0]).toBe("query-factories#query-options");
		expect(ids("retry delay")[0]).toBe("retries#retry-delay");
		expect(ids("retries mutation")).toEqual([]);
	});

	it("stops at the limit", () => {
		expect(searchDocs(docs, text, "query", 2)).toHaveLength(2);
		expect(searchDocs(docs, text, "", 2)).toHaveLength(2);
		expect(searchDocs(docs, text, "", 0)).toEqual([]);
	});

	it("finds a page by its slug, where its title says it differently", () => {
		expect(ids("comparison")).toEqual(["comparison"]);
	});

	it("ranks a page named for the query over headings, plural or not", () => {
		expect(ids("retry")[0]).toBe("retries");
		expect(ids("factory")[0]).toBe("query-factories");
		expect(marked("Retries", matchOf("retry", "retries"))).toEqual(["Retries"]);
	});

	it("finds a section by its body text", () => {
		expect(ids("prefix")).toEqual(["query-invalidation#by-filter"]);
		expect(ids("thrown")).toEqual(["retries"]);
	});

	it("finds nothing in the body before it's loaded", () => {
		expect(
			searchDocs(docs, noText, "prefix", 20).map((hit) => hit.entry.id),
		).toEqual([]);
	});

	it("ranks a name above a body that has the query", () => {
		expect(ids("invalidation")[0]).toBe("query-invalidation");
		expect(ids("filter")[0]).toBe("query-invalidation#by-filter");
	});

	it("places a heading under its page and its h2", () => {
		const [hit] = searchDocs(docs, text, "by filter", 20);
		expect(hit?.entry).toMatchObject({
			hash: "by-filter",
			section: "Guides",
			trail: ["Query invalidation", "After a mutation"],
		});
	});

	it("finds a heading by the page it sits under", () => {
		expect(ids("invalidation filter")[0]).toBe("query-invalidation#by-filter");
	});
});

describe("entriesById", () => {
	it("skips ids that are gone", () => {
		expect(
			entriesById(docs, ["retries#retry-delay", "gone", "retries"]).map(
				(entry) => entry.id,
			),
		).toEqual(["retries#retry-delay", "retries"]);
	});

	it("places a page at the top of its section", () => {
		expect(entriesById(docs, ["retries"])).toMatchObject([
			{ hash: undefined, trail: [] },
		]);
	});
});

describe("sameWord", () => {
	it.each([
		["case", "cases"],
		["setting", "settings"],
		["handle", "handles"],
		["query", "queries"],
		["class", "classes"],
		["fetch", "fetching"],
		["retry", "retries"],
	])("takes %s and %s as one, both ways", (a, b) => {
		expect(sameWord(a, b)).toBe(true);
		expect(sameWord(b, a)).toBe(true);
	});

	it("keeps other words apart", () => {
		expect(sameWord("handle", "handling")).toBe(false);
		expect(sameWord("case", "cast")).toBe(false);
		expect(sameWord("class", "clas")).toBe(false);
	});
});

describe("groupBySection", () => {
	it("groups by section, in the order of their best hit", () => {
		const hit = (id: string, section: string) => ({ entry: { id, section } });
		const grouped = groupBySection([
			hit("a", "B"),
			hit("b", "A"),
			hit("c", "B"),
		]);
		expect(
			grouped.map((group) => [
				group.section,
				group.hits.map((one) => one.entry.id),
			]),
		).toEqual([
			["B", ["a", "c"]],
			["A", ["b"]],
		]);
	});
});

describe("highlight", () => {
	it("marks the typed part of a word found by prefix", () => {
		expect(
			highlight(
				"After a mutation",
				matchOf("mutat", "query-invalidation#after-a-mutation"),
			),
		).toEqual([
			{ marked: false, text: "After a " },
			{ marked: true, text: "mutat" },
			{ marked: false, text: "ion" },
		]);
	});

	it("marks a word found with a typo whole", () => {
		expect(
			marked(
				"After a mutation",
				matchOf("mutaton", "query-invalidation#after-a-mutation"),
			),
		).toEqual(["mutation"]);
		expect(marked("Retries", matchOf("rettries", "retries"))).toEqual([
			"Retries",
		]);
	});

	it("marks the part of a camelCase word that was found", () => {
		const match = matchOf("options", "query-factories#query-options");
		expect(marked("queryOptions()", match)).toEqual(["Options"]);
	});

	it("marks every word of the query, wherever it shows", () => {
		const match = matchOf(
			"query factories opt",
			"query-factories#query-options",
		);
		expect(marked("queryOptions()", match)).toEqual(["queryOpt"]);
		expect(marked("Query factories", match)).toEqual(["Query", "factories"]);
	});

	it("marks nothing without a match", () => {
		expect(highlight("Retries", { queryTerms: [], terms: new Set() })).toEqual([
			{ marked: false, text: "Retries" },
		]);
	});
});

describe("snippetOf", () => {
	it("shows a page's description when the query is in it", () => {
		const hit = hitOf("backoff", "retries");
		expect(snippetOf(hit.entry, hit.match)).toBe(
			"Failed requests retry with backoff.",
		);
	});

	it("shows the body around what the query found in it", () => {
		const hit = hitOf("prefix", "query-invalidation#by-filter");
		const snippet = snippetOf(hit.entry, hit.match);
		expect(snippet).toBe(
			"…invalidate every query whose key starts with a prefix, and the cache refetches those a component reads.",
		);
		expect(marked(snippet, hit.match)).toEqual(["prefix"]);
	});

	it("cuts a long body at a word, after what it found", () => {
		const entry: SearchEntry = {
			body: `${"word ".repeat(10)}needle ${"after ".repeat(60)}`.trim(),
			description: "",
			hash: "a",
			id: "a#a",
			section: "S",
			slug: "a",
			text: "A",
			trail: [],
		};
		const snippet = snippetOf(entry, {
			queryTerms: ["needle"],
			terms: new Set(),
		});
		expect(snippet.startsWith("…")).toBe(true);
		expect(snippet.endsWith("after…")).toBe(true);
		expect(snippet).toContain("needle");
		expect(snippet.length).toBeLessThanOrEqual(162);
	});

	it("falls back to the description, or nothing", () => {
		const hit = hitOf("retry delay", "retries#retry-delay");
		expect(snippetOf(hit.entry, hit.match)).toBe("");
		const page = hitOf("retry", "retries");
		expect(snippetOf(page.entry, page.match)).toBe(
			"Failed requests retry with backoff.",
		);
	});
});
