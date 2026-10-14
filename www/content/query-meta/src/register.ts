import type { Register } from "@raf-query/react";

type _Keep = Register;

// #region register
declare module "@raf-query/react" {
	interface Register {
		queryMeta: {
			errorMessage?: string;
			scope?: string;
		};
	}
}
// #endregion
