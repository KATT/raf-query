import { Context } from "effect";

import * as Core from "../platform.ts";

export type { PlatformEvent } from "../platform.ts";

/** The page a cache runs in; see `Platform` in `@raf-query/core`. */
export type Platform = Core.Platform;

/**
 * The {@link Platform} `QueryCache.make` builds a cache for. Default: the
 * global `window`, `document` and `navigator`; provide another to run a
 * cache against a fake page.
 */
export const Platform = /*#__PURE__*/ Context.Reference<Platform>(
	"@raf-query/core/Platform",
	{ defaultValue: () => Core.globalPlatform },
);
