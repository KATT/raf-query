import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route(":verb", "routes/$verb/route.tsx", [
		route("issues", "routes/$verb/issues/route.tsx"),
		route("issues/:issueId", "routes/$verb/issues/$issueId/route.tsx"),
	]),
	route("issues/*", "routes/issues.$.tsx"),
	route("api/*", "routes/api.$.ts"),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
