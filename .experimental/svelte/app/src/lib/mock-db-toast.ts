import { toast } from "svelte-sonner";

/**
 * True on a deployed demo (not localhost), where each serverless instance has
 * its own seed. Set `sessionStorage.raf-query-mock-db-toast` to `"1"` to
 * preview the toast locally.
 */
function isProductionDemo() {
	if (window.sessionStorage.getItem("raf-query-mock-db-toast") === "1") {
		return true;
	}
	const { hostname } = window.location;
	return (
		hostname !== "localhost" &&
		hostname !== "127.0.0.1" &&
		hostname !== "[::1]" &&
		!hostname.endsWith(".local")
	);
}

/**
 * Warn that writes go to an in-memory mock DB. Same toast id, so repeats
 * refresh one notice instead of stacking. Call it from the browser only.
 */
export function warnMockDbWrite() {
	if (!isProductionDemo()) {
		return;
	}
	toast.warning("Edits may not stick on this demo", {
		description:
			"This app uses an in-memory mock database. On Vercel, the next request can hit a different instance, so changes often disappear after a refresh.",
		duration: 8000,
		id: "mock-db-write",
	});
}
