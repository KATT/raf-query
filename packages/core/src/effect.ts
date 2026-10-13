/**
 * The Effect API (`@raf-query/core/effect`): the cache as a service, query
 * requests as Effects, streams of changes, `Schedule` retries, and the
 * services Effect `queryFn`s run with. Nothing in the default entry imports
 * this module, so apps that don't use it don't bundle Effect.
 */
export * as Platform from "./effect/platform.ts";
export * as Query from "./effect/query.ts";
export * as QueryCache from "./effect/cache.ts";
export * as QueryObserver from "./effect/observer.ts";
export { retrySchedule } from "./effect/retry.ts";
export { fromContext, fromLayer } from "./effect/services.ts";
