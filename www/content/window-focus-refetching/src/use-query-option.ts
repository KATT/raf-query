import { type QueryHandle, useQuery } from "@raf-query/react";

import { settingsQuery } from "./queries";

declare const loaderData: { settings: QueryHandle<typeof settingsQuery> };

export function SettingsReader() {
	// #region use-query
	const [settings] = useQuery(settingsQuery, loaderData.settings, {
		refetchOnWindowFocus: false,
	});
	// #endregion
	void settings;
	return null;
}
