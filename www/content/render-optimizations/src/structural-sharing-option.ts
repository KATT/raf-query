import { queryOptions } from "@raf-query/react";

/* oxlint-disable anti-slop/no-shape-in-symbol-names -- matches the guide's GeoJSON sample */
import { getRegionShapes } from "./api";

export function regionShapesQuery(input: { region: string }) {
	// #region no-sharing
	return queryOptions({
		queryKey: ["geojson", input.region],
		queryFn: () => getRegionShapes(input),
		structuralSharing: false,
	});
	// #endregion
}
