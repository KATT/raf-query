import { Platform, QueryClient } from "@raf-query/react";
import { Layer } from "effect";

// #region platform
const listeners = new Set<(event: "focus" | "online") => void>();
let visible = true;

const FakePlatform = Layer.succeed(Platform.Platform, {
	isOnlineUnsafe: () => true,
	isServer: false,
	isVisibleUnsafe: () => visible,
	subscribeUnsafe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
});

function focus() {
	visible = true;
	for (const listener of listeners) listener("focus");
}

const queryClient = new QueryClient({ layer: FakePlatform });
// #endregion

export { focus, queryClient };
