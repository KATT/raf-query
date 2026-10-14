import { execFileSync } from "node:child_process";
import path from "node:path";

import { exampleApps } from "./example-apps.ts";

/** Typechecks each example app in `content/` as its own project. */
let failed = false;
for (const app of exampleApps(path.join(import.meta.dirname, "../content"))) {
	try {
		execFileSync("tsc", ["-p", app], { stdio: "inherit" });
	} catch {
		failed = true;
	}
}
process.exitCode = failed ? 1 : 0;
