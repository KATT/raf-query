import { Platform, QueryClient } from "@raf-query/react";
import { Layer } from "effect";

declare const AppState: {
	addEventListener(event: "change", listener: (state: string) => void): void;
	readonly currentState: string;
};

// #region platform
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

export { queryClient };
