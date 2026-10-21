import "./styles.css";

import { Boundary } from "@raf-query/experimental-effect-query";
import { Cause, Predicate } from "effect";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Demo } from "./App.tsx";
import { log } from "./log.ts";

const root = document.getElementById("root");
if (root === null) {
	throw new Error("index.html has no #root");
}

createRoot(root, {
	onCaughtError: (error, info) => {
		const caught = Boundary.caughtBy(error);
		if (caught === undefined) {
			// oxlint-disable-next-line eslint/no-console -- React's default for an error a boundary caught
			console.error(error, info.componentStack);
			return;
		}
		log({
			by: caught.boundary.name,
			root: caught.boundary.parent === undefined,
			what: Predicate.isError(caught.error)
				? caught.error.name
				: Cause.hasDies(caught.cause)
					? "a defect"
					: "an interrupt",
		});
	},
}).render(
	<StrictMode>
		<Demo />
	</StrictMode>,
);
