import MiniSearch from "minisearch";

import type { DocMeta } from "./types.ts";

/** What search reads of a page: what the manifest has, minus build details. */
export type SearchableDoc = Pick<
	DocMeta,
	"description" | "headings" | "section" | "slug" | "title"
>;

/**
 * Each section's body text, by entry id: `caching` for the text before a
 * page's first heading, `caching#garbage-collection` for a heading's. The
 * build writes it to `virtual:docs-search-text`, which loads apart from the
 * manifest.
 */
export type SearchText = Readonly<Record<string, string>>;

/** Search before the body text has loaded: names and descriptions only. */
export const noText: SearchText = {};

/** A page or a heading, as search finds it. */
export interface SearchEntry {
	/** The section's text, up to the next heading; empty when it isn't loaded. */
	readonly body: string;
	/** A page's description; empty for a heading. */
	readonly description: string;
	/** The heading's id, or `undefined` for the page itself. */
	readonly hash: string | undefined;
	readonly id: string;
	/** The sidebar section it's in: `Guides`. */
	readonly section: string;
	readonly slug: string;
	readonly text: string;
	/**
	 * What it sits under inside its section, outermost first: for a heading,
	 * its page and the `h2` an `h3` is under. Empty for a page.
	 */
	readonly trail: ReadonlyArray<string>;
}

/** What a query matched in an entry, for `highlight`. */
export interface SearchMatch {
	/** The query's words, lowercased: each marks the start of a word it begins. */
	readonly queryTerms: ReadonlyArray<string>;
	/** The indexed words they found, by prefix or with a typo: marked whole. */
	readonly terms: ReadonlySet<string>;
}

export interface SearchHit {
	readonly entry: SearchEntry;
	readonly match: SearchMatch;
}

/** MiniSearch's own tokenizer: words split at spaces and punctuation. */
const defaultTokenize = (text: string) => text.split(/[\n\r\p{Z}\p{P}]+/u);

const camelBoundary = /(?<=[a-z\d])(?=[A-Z])/;

/** `queryOptions` is found by `query`, `options` and `queryoptions`. */
const tokenize = (text: string) =>
	defaultTokenize(text).flatMap((word) => {
		const parts = word.split(camelBoundary);
		return parts.length > 1 ? [word, ...parts] : [word];
	});

function entriesOf(
	docs: ReadonlyArray<SearchableDoc>,
	text: SearchText,
): ReadonlyArray<SearchEntry> {
	return docs.flatMap((doc) => {
		const entries: Array<SearchEntry> = [
			{
				body: text[doc.slug] ?? "",
				description: doc.description,
				hash: undefined,
				id: doc.slug,
				section: doc.section,
				slug: doc.slug,
				text: doc.title,
				trail: [],
			},
		];
		let h2: string | undefined;
		for (const heading of doc.headings) {
			if (heading.depth === 2) {
				h2 = heading.text;
			}
			const id = `${doc.slug}#${heading.id}`;
			entries.push({
				body: text[id] ?? "",
				description: "",
				hash: heading.id,
				id,
				section: doc.section,
				slug: doc.slug,
				text: heading.text,
				trail: [
					doc.title,
					...(heading.depth === 3 && h2 !== undefined ? [h2] : []),
				],
			});
		}
		return entries;
	});
}

/** The words the index splits text into, as MiniSearch's tokenizer does. */
const word = /[^\n\r\p{Z}\p{P}]+/gu;

/** A name's words, lowercased: as written, and split at camelCase. */
interface Words {
	readonly parts: ReadonlyArray<string>;
	readonly whole: ReadonlyArray<string>;
}

function wordsOf(text: string): Words {
	const written = Array.from(text.matchAll(word), ([found]) => found);
	return {
		parts: written
			.flatMap((one) => one.split(camelBoundary))
			.map((part) => part.toLowerCase()),
		whole: written.map((one) => one.toLowerCase()),
	};
}

const stemsOf = new Map<string, ReadonlySet<string>>();

/** What `lower` may be a form of: `cases` of `cas` or `case`, `settings` of `sett`. */
function stems(lower: string): ReadonlySet<string> {
	const cached = stemsOf.get(lower);
	if (cached) {
		return cached;
	}
	const singular = [lower];
	if (lower.length > 4 && lower.endsWith("ies")) {
		singular.push(`${lower.slice(0, -3)}y`);
	}
	if (/(?:s|x|z|ch|sh)es$/.test(lower)) {
		singular.push(lower.slice(0, -2));
	}
	if (lower.length > 3 && lower.endsWith("s") && !lower.endsWith("ss")) {
		singular.push(lower.slice(0, -1));
	}
	const found = new Set(
		singular.flatMap((one) =>
			one.length > 6 && one.endsWith("ing") ? [one, one.slice(0, -3)] : [one],
		),
	);
	stemsOf.set(lower, found);
	return found;
}

/**
 * Whether two lowercased words are one, give or take a plural or `-ing`:
 * `retry` and `retries`, `query` and `queries`, `poll` and `polling`.
 */
export function sameWord(a: string, b: string) {
	if (a === b) {
		return true;
	}
	const ofB = stems(b);
	return [...stems(a)].some((one) => ofB.has(one));
}

/**
 * How well a name matches the query's words: 3 when it's the query, 2 when
 * it starts with it (the last word as far as it's typed), 1 when it has
 * each of its words, 0 when not.
 */
function nameMatch(name: Words, query: Words) {
	if (query.whole.length === 0) {
		return 0;
	}
	const pairs = [
		[name.whole, query.whole],
		[name.parts, query.parts],
	] as const;
	if (
		pairs.some(
			([names, queried]) =>
				names.length === queried.length &&
				queried.every((one, at) => sameWord(one, names[at] ?? "")),
		)
	) {
		return 3;
	}
	if (
		pairs.some(([names, queried]) =>
			queried.every((one, at) => {
				const named = names[at] ?? "";
				return (
					sameWord(one, named) ||
					(at === queried.length - 1 && named.startsWith(one))
				);
			}),
		)
	) {
		return 2;
	}
	const all = [...name.whole, ...name.parts];
	// `queryOptions`'s parts only in that order: not `useQueryOptionsLike`.
	const hasParts = name.parts.some((_, start) =>
		query.parts.every((one, at) => sameWord(one, name.parts[start + at] ?? "")),
	);
	return hasParts ||
		query.whole.every((one) => all.some((named) => sameWord(one, named)))
		? 1
		: 0;
}

/** The best of `names`' matches, and the words of theirs it matched. */
function namesMatch(names: ReadonlyArray<Words>, query: Words) {
	const level = Math.max(0, ...names.map((name) => nameMatch(name, query)));
	const queried = [...query.whole, ...query.parts];
	const terms = new Set(
		level === 0
			? []
			: names
					.flatMap((name) => [...name.whole, ...name.parts])
					.filter((named) =>
						queried.some(
							(one) => sameWord(one, named) || named.startsWith(one),
						),
					),
	);
	return { level, terms };
}

/** The text MiniSearch indexes for `field`, and the entry's id. */
function fieldText(entry: SearchEntry, field: string) {
	switch (field) {
		case "body":
			return entry.body;
		case "description":
			return entry.description;
		case "id":
			return entry.id;
		// A page's slug: `comparison` finds "Coming from TanStack Query".
		case "path":
			return entry.hash === undefined ? entry.slug : "";
		case "section":
			return entry.section;
		case "text":
			return entry.text;
		case "trail":
			return entry.trail.join(" ");
		default:
			return "";
	}
}

interface Index {
	readonly byId: ReadonlyMap<string, SearchEntry>;
	/** A page's title and slug; a heading's text. */
	readonly names: ReadonlyMap<string, ReadonlyArray<Words>>;
	readonly pages: ReadonlyArray<SearchEntry>;
	readonly search: MiniSearch<SearchEntry>;
}

/** By docs, then by text: the dialog searches without text until it loads. */
const indexes = new WeakMap<
	ReadonlyArray<SearchableDoc>,
	WeakMap<SearchText, Index>
>();

function indexOf(docs: ReadonlyArray<SearchableDoc>, text: SearchText): Index {
	const byText = indexes.get(docs) ?? new WeakMap<SearchText, Index>();
	indexes.set(docs, byText);
	const cached = byText.get(text);
	if (cached) {
		return cached;
	}
	const entries = entriesOf(docs, text);
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const search = new MiniSearch<SearchEntry>({
		extractField: fieldText,
		fields: ["text", "trail", "section", "description", "path", "body"],
		searchOptions: {
			boost: {
				body: 0.5,
				description: 0.5,
				path: 0.5,
				section: 0.5,
				text: 3,
			},
			// Pages over their headings.
			boostDocument: (id) =>
				byId.get(String(id))?.hash === undefined ? 1.5 : 1,
			combineWith: "AND",
			// A typo in a short word finds other short words: `ssr`, `ssg` and `use`.
			fuzzy: (term) => (term.length > 3 ? 0.2 : false),
			prefix: true,
			tokenize: defaultTokenize,
		},
		tokenize,
	});
	search.addAll(entries);
	const names = new Map(
		entries.map((entry) => [
			entry.id,
			(entry.hash === undefined ? [entry.text, entry.slug] : [entry.text]).map(
				wordsOf,
			),
		]),
	);
	const index: Index = {
		byId,
		names,
		pages: entries.filter((entry) => entry.hash === undefined),
		search,
	};
	byText.set(text, index);
	return index;
}

/** What an entry listed without a query matched: nothing to mark. */
export const noMatch: SearchMatch = { queryTerms: [], terms: new Set() };

/**
 * What `query` finds in `docs` and their body `text`, best first, fuzzy and
 * by prefix, at most `limit`; the first pages when it's empty. The index is
 * MiniSearch's, in memory, built on the first search of `docs` with `text`.
 */
export function searchDocs(
	docs: ReadonlyArray<SearchableDoc>,
	text: SearchText,
	query: string,
	limit: number,
): ReadonlyArray<SearchHit> {
	const index = indexOf(docs, text);
	if (query.trim() === "") {
		return index.pages
			.slice(0, Math.min(8, limit))
			.map((entry) => ({ entry, match: noMatch }));
	}
	const queried = wordsOf(query);
	const matchOf = (entry: SearchEntry) =>
		namesMatch(index.names.get(entry.id) ?? [], queried);
	const found = index.search.search(query).flatMap((result) => {
		const entry = index.byId.get(String(result.id));
		if (!entry) {
			return [];
		}
		// The name's words it matched as a plural or `-ing` mark too: `Retries`
		// for `retry`, which the index found in the description.
		const named = matchOf(entry);
		return [
			{
				entry,
				level: named.level,
				match: {
					queryTerms: result.queryTerms,
					terms: new Set([...result.terms, ...named.terms]),
				},
				score: result.score,
			},
		];
	});
	const foundIds = new Set(found.map((hit) => hit.entry.id));
	// A page named for the query that the index missed: `retrying` for
	// "Retries", which it finds only with typos, and not by prefix.
	const named = index.pages.flatMap((entry) => {
		if (foundIds.has(entry.id)) {
			return [];
		}
		const name = matchOf(entry);
		return name.level > 0
			? [
					{
						entry,
						level: name.level,
						match: {
							queryTerms: [...new Set(queried.whole)],
							terms: name.terms,
						},
						score: 0,
					},
				]
			: [];
	});
	return [...found, ...named]
		.toSorted(
			(a, b) =>
				tierOf(b.entry, b.level) - tierOf(a.entry, a.level) ||
				b.level - a.level ||
				b.score - a.score,
		)
		.slice(0, limit)
		.map((hit) => ({ entry: hit.entry, match: hit.match }));
}

/** What's named for the query first: pages, then headings; then the rest by score. */
function tierOf(entry: SearchEntry, level: number) {
	if (level === 0) {
		return 0;
	}
	return entry.hash === undefined ? 2 : 1;
}

/** The entries `ids` name in `docs`, in order, skipping any that are gone. */
export function entriesById(
	docs: ReadonlyArray<SearchableDoc>,
	ids: ReadonlyArray<string>,
): ReadonlyArray<SearchEntry> {
	const index = indexOf(docs, noText);
	return ids.flatMap((id) => {
		const entry = index.byId.get(id);
		return entry ? [entry] : [];
	});
}

/** Hits grouped by section, the sections in the order of their best hit. */
export function groupBySection<
	T extends { readonly entry: Pick<SearchEntry, "section"> },
>(
	hits: ReadonlyArray<T>,
): ReadonlyArray<{
	readonly hits: ReadonlyArray<T>;
	readonly section: string;
}> {
	const groups = new Map<string, Array<T>>();
	for (const hit of hits) {
		const group = groups.get(hit.entry.section);
		if (group) {
			group.push(hit);
		} else {
			groups.set(hit.entry.section, [hit]);
		}
	}
	return [...groups].map(([section, grouped]) => ({ hits: grouped, section }));
}

export interface TextRun {
	readonly marked: boolean;
	readonly text: string;
}

/** How much of `part`'s start `match` marks: a typed prefix, or a found word. */
function markedLength(part: string, match: SearchMatch) {
	const lower = part.toLowerCase();
	const prefix = Math.max(
		0,
		...match.queryTerms
			.filter((term) => lower.startsWith(term))
			.map((term) => term.length),
	);
	if (prefix > 0) {
		return Math.min(prefix, part.length);
	}
	return match.terms.has(lower) ? part.length : 0;
}

/**
 * `text` in runs, marked where `match` found it: the typed part of a word
 * found by prefix (`invali` in `invalidate`), a word found with a typo whole
 * (`invalidate` for `invalidte`), and the part of a camelCase word that was
 * found (`Options` in `queryOptions`).
 */
export function highlight(
	text: string,
	match: SearchMatch,
): ReadonlyArray<TextRun> {
	const ranges: Array<[number, number]> = [];
	const mark = (start: number, length: number) => {
		const last = ranges.at(-1);
		if (last && start <= last[1]) {
			last[1] = Math.max(last[1], start + length);
		} else if (length > 0) {
			ranges.push([start, start + length]);
		}
	};
	for (const found of text.matchAll(word)) {
		mark(found.index, markedLength(found[0], match));
		let at = found.index;
		for (const part of found[0].split(camelBoundary)) {
			mark(at, markedLength(part, match));
			at += part.length;
		}
	}
	const runs: Array<TextRun> = [];
	let at = 0;
	for (const [start, end] of ranges) {
		if (start > at) {
			runs.push({ marked: false, text: text.slice(at, start) });
		}
		runs.push({ marked: true, text: text.slice(start, end) });
		at = end;
	}
	if (at < text.length) {
		runs.push({ marked: false, text: text.slice(at) });
	}
	return runs;
}

/** Where `match` first marks a word of `text`, or `undefined`. */
function firstMark(text: string, match: SearchMatch) {
	for (const found of text.matchAll(word)) {
		const parts = [found[0], ...found[0].split(camelBoundary)];
		if (parts.some((part) => markedLength(part, match) > 0)) {
			return found.index;
		}
	}
	return undefined;
}

/** How much of the body a result shows around what it found. */
const excerptLength = 160;

/** How much of that comes before the first marked word. */
const excerptLead = 40;

/**
 * The line a result shows under its name: a page's description when the
 * query is in it, or else the part of the section's body around the first
 * word the query found, so a match in the body shows why the result is
 * there. A page's description, or nothing, when neither has it.
 */
export function snippetOf(entry: SearchEntry, match: SearchMatch) {
	if (firstMark(entry.description, match) !== undefined) {
		return entry.description;
	}
	const at = firstMark(entry.body, match);
	if (at === undefined) {
		return entry.description;
	}
	const space = entry.body.lastIndexOf(" ", Math.max(0, at - excerptLead));
	const start = at <= excerptLead ? 0 : space === -1 ? at : space + 1;
	const end = start + excerptLength;
	if (end >= entry.body.length) {
		return `${start > 0 ? "…" : ""}${entry.body.slice(start)}`;
	}
	const cut = entry.body.lastIndexOf(" ", end);
	return `${start > 0 ? "…" : ""}${entry.body.slice(start, cut > at ? cut : end)}…`;
}
