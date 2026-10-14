import type { QueryClient } from "@raf-query/react";
import { createContext } from "react";

/**
 * How a demo's browser reloads its variant: `restart` swaps in a new client
 * and empties the server, as a reload drops the page's memory, and returns
 * the new client. The variant's own controls stay mounted.
 */
export interface DemoRestart {
	/** Counts restarts, to key what must remount with the new client. */
	readonly count: number;
	restart(): QueryClient<unknown>;
}

export const DemoRestartContext = createContext<DemoRestart | null>(null);
