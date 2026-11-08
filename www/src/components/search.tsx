import { Button } from "@examples/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@examples/ui/components/dialog";
import { cn } from "@examples/ui/lib/utils";
import {
	Link,
	useHydrated,
	useLocation,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { Search, SearchX, X } from "lucide-react";
import {
	type MouseEvent,
	type ReactNode,
	useDeferredValue,
	useId,
	useRef,
	useState,
} from "react";

import { SearchHit } from "~/components/search-hit.tsx";
import { allDocs } from "~/content/docs.ts";
import {
	entriesById,
	groupBySection,
	noMatch,
	type SearchEntry,
	type SearchHit as Hit,
	searchDocs,
	type SearchText,
} from "~/content/search.ts";
import { preloadSearchText, useSearchText } from "~/content/search-text.ts";
import { readRecent, withRecent, writeRecent } from "~/recent-searches.ts";
import { searchPage } from "~/search-page.ts";
import { site } from "~/site.ts";

/** The `/search` page's field, which the shortcuts focus there. */
export const searchInputId = "search-query";

/** How long typing pauses before the URL catches up. */
const urlDelayMs = 300;

/** Rewrites `?q=` in place: the same history entry, no scrolling, the hash kept. */
function useReplaceQuery() {
	const navigate = useNavigate();
	return (query: string) =>
		void navigate({
			hash: true,
			hashScrollIntoView: false,
			replace: true,
			resetScroll: false,
			search: (prev) => ({ ...prev, q: query === "" ? undefined : query }),
			to: ".",
		});
}

/**
 * A search field's text, kept in `?q=`: in the field at once, in the URL
 * once typing pauses. A URL changed from elsewhere (a link, the browser's
 * own search, closing the dialog) replaces it. Before hydration it's empty,
 * as the prerendered page is.
 */
export function useSearchQuery() {
	const router = useRouter();
	const hydrated = useHydrated();
	const urlQuery = useSearch({ select: (search) => search.q, strict: false });
	const replaceQuery = useReplaceQuery();
	const [state, setState] = useState({
		query: urlQuery ?? "",
		/** The URL's query this state has seen. */
		url: urlQuery,
		/** The query typing will write to the URL. */
		written: urlQuery,
	});
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	let current = state;
	if (urlQuery !== state.url) {
		current =
			urlQuery === state.written
				? { ...state, url: urlQuery }
				: { query: urlQuery ?? "", url: urlQuery, written: urlQuery };
		setState(current);
	}
	return {
		/**
		 * Drops a change the URL hasn't caught up with and empties the field,
		 * when following a link away, which sets the URL itself.
		 */
		cancel: () => {
			clearTimeout(timer.current);
			setState({ query: "", url: current.url, written: current.url });
		},
		change: (next: string) => {
			setState({
				query: next,
				url: current.url,
				written: next === "" ? undefined : next,
			});
			clearTimeout(timer.current);
			// Written only where it was typed: not over a link followed since,
			// or onto the next page.
			const from = router.state.location;
			timer.current = setTimeout(() => {
				const now = router.state.location;
				if (now.pathname === from.pathname && now.search.q === from.search.q) {
					replaceQuery(next);
				}
			}, urlDelayMs);
		},
		/** Empties the field and `?q=` at once: closing the dialog. */
		clear: () => {
			clearTimeout(timer.current);
			setState({ query: "", url: current.url, written: undefined });
			if (current.url !== undefined) {
				replaceQuery("");
			}
		},
		query: hydrated ? current.query : "",
	};
}

/** Whether the focus is somewhere `/` types a slash. */
const isEditing = () =>
	document.activeElement?.matches(
		"input, select, textarea, [contenteditable]:not([contenteditable='false'])",
	) ?? false;

/**
 * The header's search: a dialog over the page, opened by ⌘K, Ctrl+K or `/`,
 * and by `?q=` in the URL, which it keeps in step. On `/search` it moves to
 * that page's field instead.
 */
export function SearchButton() {
	const hydrated = useHydrated();
	const urlQuery = useSearch({ select: (search) => search.q, strict: false });
	const onSearchPage = useLocation({
		select: (location) => location.pathname === searchPage.path,
	});
	const search = useSearchQuery();
	const [open, setOpen] = useState(false);
	// A link to `?q=` opens it, once the page has hydrated.
	const linked = hydrated && !onSearchPage && urlQuery !== undefined;
	const [wasLinked, setWasLinked] = useState(false);
	if (linked !== wasLinked) {
		setWasLinked(linked);
		if (linked) {
			setOpen(true);
		}
	}
	const show = () => {
		if (onSearchPage) {
			const input = document.querySelector<HTMLInputElement>(
				`#${searchInputId}`,
			);
			input?.focus();
			input?.select();
		} else {
			void preloadSearchText();
			setOpen(true);
		}
	};
	const onKeyDown = (event: KeyboardEvent) => {
		const modK =
			event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
		const slash =
			event.key === "/" &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!isEditing();
		if (modK || slash) {
			event.preventDefault();
			show();
		}
	};

	return (
		<>
			<Button
				aria-haspopup="dialog"
				aria-keyshortcuts="Meta+K Control+K /"
				className="w-9 justify-start px-0 text-muted-foreground sm:w-56 sm:px-3"
				onClick={show}
				onFocus={() => {
					void preloadSearchText();
				}}
				onPointerEnter={() => {
					void preloadSearchText();
				}}
				ref={(button) => {
					if (button === null) {
						return;
					}
					window.addEventListener("keydown", onKeyDown);
					return () => {
						window.removeEventListener("keydown", onKeyDown);
					};
				}}
				size="sm"
				title="Search docs (⌘K)"
				variant="outline"
			>
				<Search className="mx-auto sm:mx-0" />
				<span className="hidden sm:inline">Search docs…</span>
				<kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
					⌘K
				</kbd>
			</Button>
			<Dialog
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) {
						search.clear();
					}
				}}
				open={open}
			>
				{/* On a phone the keyboard covers the bottom half of the screen. */}
				<DialogContent
					className="top-3 translate-y-0 grid-cols-1 gap-0 p-0 sm:top-[12%] sm:max-w-2xl"
					showCloseButton={false}
				>
					<DialogTitle className="sr-only">Search the docs</DialogTitle>
					<DialogDescription className="sr-only">
						Type to find a page or a section. Use the up and down arrows to pick
						a result and Enter to open it.
					</DialogDescription>
					{open ? (
						<SearchPanel
							onFollow={() => {
								setOpen(false);
							}}
							search={search}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}

interface Group {
	readonly hits: ReadonlyArray<Hit>;
	readonly title: string;
}

/** A click the browser takes: to a new tab or window, or a download. */
const modified = (event: MouseEvent) =>
	event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

function SearchPanel(props: {
	readonly onFollow: () => void;
	readonly search: ReturnType<typeof useSearchQuery>;
}) {
	const text = useSearchText();
	const search = props.search;
	const query = useDeferredValue(search.query);
	const [active, setActive] = useState(0);
	const [recentIds, setRecentIds] = useState(readRecent);
	const saveRecent = (ids: ReadonlyArray<string>) => {
		writeRecent(ids);
		setRecentIds(ids);
	};
	const listId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	const searching = query.trim() !== "";
	const hits = searching ? searchDocs(allDocs, text, query, 20) : [];
	const groups: ReadonlyArray<Group> = searching
		? groupBySection(hits).map((group) => ({
				hits: group.hits,
				title: group.section,
			}))
		: emptyQueryGroups(text, recentIds);
	const options = groups.flatMap((group) => group.hits);
	const selected = Math.min(active, Math.max(options.length - 1, 0));
	const optionId = (index: number) => `${listId}-option-${index}`;

	// Arrowing keeps the pick in view.
	const pick = (index: number) => {
		setActive(index);
		document
			.getElementById(optionId(index))
			?.scrollIntoView({ block: "nearest" });
	};

	const remember = (entry: SearchEntry) => {
		saveRecent(withRecent(recentIds, entry.id));
	};
	const follow = (entry: SearchEntry) => {
		remember(entry);
		search.cancel();
		props.onFollow();
	};

	// A new query starts at the top.
	const change = (next: string) => {
		search.change(next);
		setActive(0);
		listRef.current?.scrollTo({ top: 0 });
	};

	return (
		<div className="grid min-w-0 grid-cols-1">
			<div className="flex items-center gap-2 border-b pr-2 pl-4">
				<Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
				<input
					aria-activedescendant={
						options.length > 0 ? optionId(selected) : undefined
					}
					aria-autocomplete="list"
					aria-controls={listId}
					aria-expanded={options.length > 0}
					aria-label="Search the docs"
					autoCapitalize="off"
					autoComplete="off"
					autoCorrect="off"
					autoFocus
					className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
					enterKeyHint="go"
					inputMode="search"
					onChange={(event) => {
						change(event.target.value);
					}}
					onKeyDown={(event) => {
						const count = options.length;
						if (event.nativeEvent.isComposing) {
							return;
						}
						if (event.key === "ArrowDown" && count > 0) {
							event.preventDefault();
							pick((selected + 1) % count);
						} else if (event.key === "ArrowUp" && count > 0) {
							event.preventDefault();
							pick((selected - 1 + count) % count);
						} else if (event.key === "Enter" && options[selected]) {
							event.preventDefault();
							const link = document.getElementById(optionId(selected));
							const href = link?.getAttribute("href");
							if (!link || href === null || href === undefined) {
								return;
							}
							if (event.metaKey || event.ctrlKey) {
								remember(options[selected].entry);
								window.open(href, "_blank", "noopener");
							} else {
								link.click();
							}
						}
					}}
					placeholder="Search guides, APIs, options…"
					ref={inputRef}
					role="combobox"
					spellCheck={false}
					type="text"
					value={search.query}
				/>
				{search.query === "" ? null : (
					<Button
						aria-label="Clear the search"
						onClick={() => {
							change("");
							inputRef.current?.focus();
						}}
						size="icon-sm"
						variant="ghost"
					>
						<X />
					</Button>
				)}
				<DialogClose
					render={
						<Button
							className="text-muted-foreground"
							size="sm"
							variant="ghost"
						/>
					}
				>
					<span className="sm:hidden">Cancel</span>
					<kbd
						aria-hidden
						className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline"
					>
						Esc
					</kbd>
					<span className="sr-only max-sm:hidden">Close</span>
				</DialogClose>
			</div>
			<p aria-live="polite" className="sr-only">
				{searching
					? hits.length === 0
						? `No results for ${query}`
						: `${hits.length} ${hits.length === 1 ? "result" : "results"}`
					: ""}
			</p>
			{searching && hits.length === 0 ? <NoResults query={query} /> : null}
			<ul
				aria-label="Search results"
				className={cn(
					"max-h-[55dvh] overflow-y-auto overscroll-contain p-2 sm:max-h-[min(60vh,32rem)]",
					options.length === 0 && "hidden",
				)}
				id={listId}
				ref={listRef}
				role="listbox"
			>
				{groups.map((group, groupIndex) => {
					const titleId = `${listId}-group-${groupIndex}`;
					return (
						<li key={group.title} role="presentation">
							<div
								className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground"
								id={titleId}
							>
								{group.title}
							</div>
							<ul aria-labelledby={titleId} className="mb-1" role="group">
								{group.hits.map((hit) => {
									const index = options.indexOf(hit);
									const entry = hit.entry;
									return (
										<li key={entry.id} role="presentation">
											{/* The link is the option, so it's a real link: it
											    opens in a new tab with a modifier or a middle click. */}
											<Link
												aria-selected={index === selected}
												className="flex items-start gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent"
												hash={entry.hash}
												id={optionId(index)}
												onAuxClick={(event) => {
													if (event.button === 1) {
														remember(entry);
													}
												}}
												onClick={(event) => {
													if (modified(event)) {
														remember(entry);
													} else {
														follow(entry);
													}
												}}
												onPointerMove={() => {
													setActive(index);
												}}
												params={{ slug: entry.slug }}
												role="option"
												tabIndex={-1}
												to="/docs/$slug"
											>
												<SearchHit hit={hit} withSnippet={searching} />
											</Link>
										</li>
									);
								})}
							</ul>
						</li>
					);
				})}
			</ul>
			<div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
				<span className="hidden items-center gap-1.5 sm:flex">
					<Kbd>↑</Kbd>
					<Kbd>↓</Kbd> to move
				</span>
				<span className="hidden items-center gap-1.5 sm:flex">
					<Kbd>↵</Kbd> to open
				</span>
				<span className="hidden items-center gap-1.5 sm:flex">
					<Kbd>⌘↵</Kbd> in a new tab
				</span>
				{!searching && recentIds.length > 0 ? (
					<button
						className="ml-auto font-medium hover:text-foreground"
						onClick={() => {
							saveRecent([]);
							setActive(0);
							inputRef.current?.focus();
						}}
						type="button"
					>
						Clear recent
					</button>
				) : null}
				{hits.length > 0 ? (
					<Link
						className="ml-auto font-medium text-foreground underline-offset-3 hover:underline"
						onClick={() => {
							search.cancel();
							props.onFollow();
						}}
						search={{ q: search.query }}
						to={searchPage.path}
					>
						All results
					</Link>
				) : null}
			</div>
		</div>
	);
}

/** Before a query: what the reader opened last, then where to start. */
function emptyQueryGroups(
	text: SearchText,
	recentIds: ReadonlyArray<string>,
): ReadonlyArray<Group> {
	const recent = entriesById(allDocs, recentIds).map((entry) => ({
		entry,
		match: noMatch,
	}));
	const recentIdSet = new Set(recentIds);
	const suggested = searchDocs(allDocs, text, "", 8).filter(
		(hit) => !recentIdSet.has(hit.entry.id),
	);
	const groups: ReadonlyArray<Group> = [
		{ hits: recent, title: "Recent" },
		{ hits: suggested, title: "Start here" },
	];
	return groups.filter((group) => group.hits.length > 0);
}

export function NoResults(props: { readonly query: string }) {
	return (
		<div className="grid justify-items-center gap-2 px-6 py-10 text-center text-sm">
			<SearchX aria-hidden className="size-6 text-muted-foreground" />
			<p>
				No results for “
				<span className="font-medium break-all">{props.query}</span>”
			</p>
			<p className="text-pretty text-muted-foreground">
				Check the spelling or try fewer words. Still stuck?{" "}
				<a
					className="text-foreground underline underline-offset-3"
					href={`${site.github}/issues?q=${encodeURIComponent(props.query)}`}
				>
					Search the GitHub issues
				</a>
			</p>
		</div>
	);
}

function Kbd(props: { readonly children: ReactNode }) {
	return (
		<kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">
			{props.children}
		</kbd>
	);
}
