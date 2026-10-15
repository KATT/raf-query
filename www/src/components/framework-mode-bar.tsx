import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import {
	type FrameworkMode,
	frameworkModeLabels,
	frameworkModeSearch,
	frameworkModes,
} from "~/framework-mode.ts";

/**
 * Floating control under the site header. Switches which framework the
 * homepage examples show; the choice lives in `?mode=` on `/`.
 */
export function FrameworkModeBar(props: { readonly mode: FrameworkMode }) {
	return (
		<div className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-30 flex justify-center px-4">
			<div
				aria-label="Framework for homepage examples"
				className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/90 p-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/75"
				role="group"
			>
				{frameworkModes.map((mode) => {
					const active = mode === props.mode;
					return (
						<Link
							activeOptions={{ exact: true, includeSearch: true }}
							aria-current={active ? "true" : undefined}
							className={cn(
								"rounded-full px-3.5 py-1.5 text-sm transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
								active
									? "bg-foreground font-medium text-background"
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
	);
}
