import { type QueryHandle, useQuery } from "@raf-query/react";
import type { ReactNode } from "react";

import { pushStateQuery } from "./ssr-and-hydration.ts";

declare function PushSwitch(props: {
	readonly state: "on" | "off" | "unknown";
}): ReactNode;

// #region push-state
function PushSettings(props: { handle: QueryHandle<typeof pushStateQuery> }) {
	const [pushThenable] = useQuery(pushStateQuery, props.handle);
	// "unknown" on the server and until the browser has detected it.
	const push =
		pushThenable.status === "fulfilled" ? pushThenable.value : "unknown";
	return <PushSwitch state={push} />;
}
// #endregion push-state

export { PushSettings };
