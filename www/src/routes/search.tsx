import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { type KeyboardEvent, useDeferredValue, useRef } from "react";

import {
	NoResults,
	searchInputId,
	useSearchQuery,
} from "~/components/search.tsx";
import { SearchHit } from "~/components/search-hit.tsx";
import { allDocs } from "~/content/docs.ts";
import { groupBySection, searchDocs } from "~/content/search.ts";
import { useSearchText } from "~/content/search-text.ts";
import { rememberRecent } from "~/recent-searches.ts";
import { searchPage } from "~/search-page.ts";
import { absoluteUrl } from "~/seo.ts";
import { site } from "~/site.ts";

/** At most this many results; the count says `50+`. */
const limit = 50;

/**
 * The pages and sections `?q=` (`querySearchSchema`, on the root route)
 * finds. The site is prerendered, so this is the empty form, and the
 * browser lists what `?q=` finds once it has loaded.
 */
export const Route = createFileRoute("/search")({
	head: () => ({
		links: [{ href: absoluteUrl(searchPage.path), rel: "canonical" }],
		meta: [
			{ title: `${searchPage.title} | ${site.name}` },
			{ content: searchPage.description, name: "description" },
			{ content: "noindex", name: "robots" },
		],
	}),
	component: SearchPage,
});

/** Up and down move between the field and the results, as in the dialog. */
function moveFocus(event: KeyboardEvent, list: HTMLElement | null) {
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
		return;
	}
	const links = [
		...(list?.querySelectorAll<HTMLAnchorElement>("a[data-search-hit]") ?? []),
	];
	const at = links.findIndex((link) => link.matches(":focus"));
	const next =
		event.key === "ArrowDown"
			? links[at + 1]
			: at <= 0
				? document.getElementById(searchInputId)
				: links[at - 1];
	if (next) {
		event.preventDefault();
		next.focus();
	}
}

function SearchPage() {
	const text = useSearchText();
	const search = useSearchQuery();
	const query = useDeferredValue(search.query);
	const listRef = useRef<HTMLDivElement>(null);
	const searching = query.trim() !== "";
	const hits = searching ? searchDocs(allDocs, text, query, limit) : [];
	return (
		<main className="mx-auto grid w-full max-w-3xl grid-cols-1 content-start gap-6 px-4 py-12 sm:px-6 sm:py-16">
			<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
				{searchPage.title}
			</h1>
			<form
				action={searchPage.path}
				className="flex items-center gap-3 rounded-lg border pr-2 pl-4 focus-within:ring-3 focus-within:ring-ring/50"
				method="get"
				onSubmit={(event) => {
					event.preventDefault();
				}}
				role="search"
			>
				<Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
				<label className="sr-only" htmlFor={searchInputId}>
					Search the docs
				</label>
				<input
					autoCapitalize="off"
					autoComplete="off"
					autoCorrect="off"
					autoFocus
					className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
					enterKeyHint="search"
					id={searchInputId}
					name="q"
					onChange={(event) => {
						search.change(event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown" && !event.nativeEvent.isComposing) {
							moveFocus(event, listRef.current);
						}
					}}
					placeholder="Search guides, APIs, options…"
					spellCheck={false}
					type="search"
					value={search.query}
				/>
				{search.query === "" ? null : (
					<button
						aria-label="Clear the search"
						className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
						onClick={() => {
							search.change("");
							document.getElementById(searchInputId)?.focus();
						}}
						type="button"
					>
						<X className="size-4" />
					</button>
				)}
			</form>
			<p aria-live="polite" className="text-sm text-muted-foreground">
				{searching
					? hits.length === 0
						? ""
						: `${hits.length}${hits.length === limit ? "+" : ""} ${hits.length === 1 ? "result" : "results"} for “${query}”`
					: "Find a page, or a section of one, in the docs. Press / or ⌘K to search from any page."}
			</p>
			{searching && hits.length === 0 ? <NoResults query={query} /> : null}
			<div
				className="grid grid-cols-1 gap-8"
				onKeyDown={(event) => {
					moveFocus(event, listRef.current);
				}}
				ref={listRef}
			>
				{groupBySection(hits).map((group) => (
					<section
						aria-label={group.section}
						className="grid grid-cols-1 gap-2"
						key={group.section}
					>
						<h2 className="text-sm font-semibold text-muted-foreground">
							{group.section}
						</h2>
						<ul className="grid grid-cols-1 gap-2">
							{group.hits.map((hit) => (
								<li key={hit.entry.id}>
									<Link
										className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent/50"
										data-search-hit
										hash={hit.entry.hash}
										onAuxClick={(event) => {
											if (event.button === 1) {
												rememberRecent(hit.entry.id);
											}
										}}
										onClick={() => {
											rememberRecent(hit.entry.id);
										}}
										params={{ slug: hit.entry.slug }}
										to="/docs/$slug"
									>
										<SearchHit hit={hit} withSnippet />
									</Link>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	);
}
