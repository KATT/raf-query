import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("prefetch/issues", "routes/prefetch/issues/route.tsx"),
	route(
		"prefetch/issues/:issueId",
		"routes/prefetch/issues/$issueId/route.tsx",
	),
	route("swr/issues", "routes/swr/issues/route.tsx"),
	route("swr/issues/:issueId", "routes/swr/issues/$issueId/route.tsx"),
	route("revalidate/issues", "routes/revalidate/issues/route.tsx"),
	route(
		"revalidate/issues/:issueId",
		"routes/revalidate/issues/$issueId/route.tsx",
	),
	route("issues/*", "routes/issues.$.tsx"),
	route("api/*", "routes/api.$.ts"),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
