/** Runs once when the server starts. */
export async function register() {
	if (process.env["NEXT_RUNTIME"] !== "nodejs") {
		return;
	}
	const db = await import("@examples/db");
	const headers = await import("next/headers");
	db.setLatencySource(async () => {
		try {
			const cookies = await headers.cookies();
			return db.parseLatency(cookies.get(db.LATENCY_COOKIE)?.value);
		} catch {
			// Outside a request, such as during the build.
			return undefined;
		}
	});
}
