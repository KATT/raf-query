import { queryOptions } from "@raf-query/react";

declare const input: { region: string };

declare function getRegionShapes(input: {
	readonly region: string;
}): Promise<unknown>;

// #region structural-sharing
queryOptions({
	queryKey: ["geojson", input.region],
	queryFn: () => getRegionShapes(input),
	structuralSharing: false,
});
// #endregion

declare function getSchedule(input: { readonly day: string }): Promise<{
	readonly slots: ReadonlyArray<{
		readonly start: Date;
		readonly title: string;
	}>;
}>;

// #region custom-merge
export function scheduleQuery(input: { day: string }) {
	return queryOptions({
		queryKey: ["schedule", input.day],
		queryFn: () => getSchedule(input),
		structuralSharing: (oldData, newData) =>
			JSON.stringify(oldData) === JSON.stringify(newData) ? oldData : newData,
	});
}
// #endregion
