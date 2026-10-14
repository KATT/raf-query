import { QueryClient } from "@raf-query/react";

import "./register";

// #region defaults
const queryClient = new QueryClient({
	defaults: { meta: { errorMessage: "Something went wrong" } },
});
// #endregion

export { queryClient };
