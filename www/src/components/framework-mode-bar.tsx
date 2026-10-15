import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import {
	type FrameworkMode,
	frameworkModeLabels,
	frameworkModeSearch,
	frameworkModes,
} from "~/framework-mode.ts";

/**
 * Sticky under the site header. Switches which framework the homepage
 * examples show; the choice lives in `?mode=` on `/`.
 */
export function FrameworkModeBar(props: {
	readonly mode: FrameworkMode;
}) {
	return (
		<div className="sticky top-14 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
			<div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
				<span className="text-sm text-muted-foreground">Examples</span>
				<div
					aria-label="Framework"
					className="flex items-center gap-0.5 rounded-lg border p-0.5"
					role="group"
				>
					{frameworkModes.map((mode) => {
						const active = mode === props.mode;
						return (
							<Link
								activeOptions={{ exact: true, includeSearch: true }}
								aria-current={active ? "true" : undefined}
								className={cn(
									"rounded-md px-3 py-1 text-sm transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
									active
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground",
								)}
								key={mode}
								replace
								search={frameworkModeSearch(mode)}
								to="/"
							>
								{frameworkModeLabels[mode]}
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
}
