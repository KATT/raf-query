import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use, type ReactNode } from "react";

import { pushStateQuery } from "./ssr-and-hydration.ts";

declare const loaderData: {
	push: QueryHandle<typeof pushStateQuery>;
};

declare function PushSwitch(props: {
	readonly state: "on" | "off" | "unknown";
}): ReactNode;

// #region push-state
function PushSettings() {
	return (
		<Suspense fallback={<PushSwitch state="unknown" />}>
			<PushState />
		</Suspense>
	);
}

function PushState() {
	const [push] = useQuery(pushStateQuery, loaderData.push);
	return <PushSwitch state={use(push)} />;
}
// #endregion
