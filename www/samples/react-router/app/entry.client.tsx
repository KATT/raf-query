import { isBrowserRenderError } from "@raf-query/react";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<HydratedRouter />
		</StrictMode>,
		{
			// A boundary the server left to the browser isn't an error to report.
			onRecoverableError: (error) => {
				if (!isBrowserRenderError(error)) {
					reportError(error);
				}
			},
		},
	);
});
