import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route(":verb", "routes/$verb/route.tsx", [
		route("issues", "routes/$verb/issues/route.tsx"),
		route("issues/:issueId", "routes/$verb/issues/$issueId/route.tsx"),
	]),
	route("issues/*", "routes/issues.$.tsx"),
	// React Router ranks `:verb/issues/…` above `api/*` for `/api/issues/…`;
	// the static `issues` segment puts the API first.
	route("api/issues/*", "routes/api.$.ts"),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
