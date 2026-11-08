import { cn } from "@examples/ui/lib/utils";
import { ChevronRight, FileText, Hash } from "lucide-react";
import { Fragment } from "react";

import {
	highlight,
	type SearchHit as Hit,
	type SearchMatch,
	snippetOf,
} from "~/content/search.ts";

/** `text` with the words `match` found marked. */
export function Highlighted(props: {
	readonly match: SearchMatch;
	readonly text: string;
}) {
	return highlight(props.text, props.match).map((run, at) =>
		run.marked ? (
			<mark
				className="rounded-[0.2em] bg-primary/15 text-inherit dark:bg-primary/25"
				key={at}
			>
				{run.text}
			</mark>
		) : (
			<Fragment key={at}>{run.text}</Fragment>
		),
	);
}

/**
 * A result: what was found, with where it sits under its section (for a
 * heading, its page and `h2`), and under it a page's description or the
 * part of the section's text the query found.
 */
export function SearchHit(props: {
	readonly hit: Hit;
	/** Shows the description or the found text under it. */
	readonly withSnippet: boolean;
}) {
	const entry = props.hit.entry;
	const match = props.hit.match;
	const isHeading = entry.hash !== undefined;
	const Icon = isHeading ? Hash : FileText;
	const snippet = props.withSnippet ? snippetOf(entry, match) : "";
	return (
		<>
			<Icon
				aria-label={isHeading ? "Section" : "Page"}
				className="mt-0.5 size-4 shrink-0 text-muted-foreground"
				role="img"
			/>
			<span className="grid min-w-0 flex-1 grid-cols-1 gap-0.5">
				<span className="truncate font-medium">
					<Highlighted match={match} text={entry.text} />
				</span>
				{entry.trail.length > 0 ? (
					<span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
						<span className="sr-only">on</span>
						{entry.trail.map((crumb, index) => (
							<Fragment key={index}>
								{index > 0 ? (
									<ChevronRight aria-hidden className="size-3 shrink-0" />
								) : null}
								<span
									className={cn(
										"truncate",
										index === entry.trail.length - 1 && "shrink-[0.25]",
									)}
								>
									<Highlighted match={match} text={crumb} />
								</span>
							</Fragment>
						))}
					</span>
				) : null}
				{snippet === "" ? null : (
					<span className="line-clamp-2 text-xs text-pretty text-muted-foreground">
						<Highlighted match={match} text={snippet} />
					</span>
				)}
			</span>
		</>
	);
}
