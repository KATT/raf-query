import { setLatencySource } from "@examples/db";
import { LATENCY_COOKIE, parseLatency } from "@examples/db/types";
import { getCookie } from "@tanstack/react-start/server";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

setLatencySource(async () => parseLatency(getCookie(LATENCY_COOKIE)));

export default createServerEntry(handler);
