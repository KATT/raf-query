import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("issues", "routes/issues/route.tsx"),
	route("issues/:issueId", "routes/issues/$issueId/route.tsx"),
	route("api/*", "routes/api.$.ts"),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
