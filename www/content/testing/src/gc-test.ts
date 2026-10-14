import { Platform, QueryCache } from "@raf-query/react";
import { expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";

import { todosQuery } from "./queries";

const listeners = new Set<(event: "focus" | "online") => void>();
const FakePlatform = Layer.succeed(Platform.Platform, {
	isOnlineUnsafe: () => true,
	isServer: false,
	isVisibleUnsafe: () => true,
	subscribeUnsafe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
});

// #region gc
it.effect("garbage-collects unread entries", () =>
	Effect.gen(function* () {
		const cache = yield* QueryCache.QueryCache;
		yield* cache.fetch(todosQuery);
		yield* TestClock.adjust("5 minutes");
		expect(Option.isNone(yield* cache.getData(todosQuery))).toBe(true);
	}).pipe(Effect.provide(QueryCache.layer()), Effect.provide(FakePlatform)),
);
// #endregion
