"use client";

import {
	QueryDevtools as DevelopmentQueryDevtools,
	QueryDevtoolsPanel as DevelopmentQueryDevtoolsPanel,
} from "./devtools-panel.tsx";

export type {
	DevtoolsTheme,
	QueryDevtoolsPanelProps,
	QueryDevtoolsProps,
} from "./devtools-panel.tsx";

// Bundlers replace `process.env.NODE_ENV`, so production builds drop the
// panel's code along with the branch that uses it.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

function Nothing() {
	return null;
}

/** Toggle button plus docked panel. Renders nothing in production builds. */
export const QueryDevtools: typeof DevelopmentQueryDevtools =
	process.env.NODE_ENV === "production" ? Nothing : DevelopmentQueryDevtools;

/** The panel alone, to embed anywhere. Renders nothing in production builds. */
export const QueryDevtoolsPanel: typeof DevelopmentQueryDevtoolsPanel =
	process.env.NODE_ENV === "production"
		? Nothing
		: DevelopmentQueryDevtoolsPanel;
