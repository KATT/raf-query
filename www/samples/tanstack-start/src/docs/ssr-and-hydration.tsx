import { useQuery, waterfallHandle } from "@raf-query/react";
import { useHydrated } from "@tanstack/react-router";
import { Suspense, use, useState, type ReactNode } from "react";

import { pushStateQuery } from "./ssr-and-hydration.ts";

declare function PushSwitch(props: {
	readonly state: "on" | "off" | "unknown";
}): ReactNode;

// #region push-state
function PushSettings() {
	// `false` on the server and while hydrating, `true` after.
	const hydrated = useHydrated();
	if (!hydrated) {
		return <PushSwitch state="unknown" />;
	}
	return (
		<Suspense fallback={<PushSwitch state="unknown" />}>
			<PushState />
		</Suspense>
	);
}

function PushState() {
	const [handle] = useState(() =>
		waterfallHandle(pushStateQuery, { channel: "news" }),
	);
	const [pushThenable] = useQuery(pushStateQuery, handle);
	const push = use(pushThenable);
	return <PushSwitch state={push} />;
}
// #endregion push-state

export { PushSettings };
