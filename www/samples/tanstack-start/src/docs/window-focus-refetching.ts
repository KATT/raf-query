import { queryOptions } from "@raf-query/react";
import { getSettings, listTodos } from "~/api.ts";
import { Platform, QueryClient } from "@raf-query/react";
import { Layer } from "effect";

// #region turning-it-off
export function settingsQuery() {
	return queryOptions({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
		refetchOnWindowFocus: false,
	});
}
// #endregion

// #region always
export function todosQuery() {
	return queryOptions({
		queryKey: ["todos"],
		queryFn: () => listTodos(),
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: "always",
	});
}
// #endregion

declare const AppState: {
	readonly currentState: string;
	addEventListener(event: "change", listener: (state: string) => void): void;
};

// #region a-custom-platform
const listeners = new Set<(event: "focus" | "online") => void>();

const AppPlatform = Layer.succeed(Platform.Platform, {
	isOnlineUnsafe: () => true,
	isServer: false,
	isVisibleUnsafe: () => AppState.currentState === "active",
	subscribeUnsafe(listener) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
});

AppState.addEventListener("change", (state) => {
	if (state === "active") {
		for (const listener of listeners) listener("focus");
	}
});

const queryClient = new QueryClient({ layer: AppPlatform });
// #endregion
