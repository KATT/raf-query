import { isBrowserRenderError } from "@raf-query/react";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
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
