import type { QueryClient } from "@raf-query/react";
import { createRootRouteWithContext } from "@tanstack/react-router";

import { IssueApi } from "./issue-api";

// #region context
createRootRouteWithContext<{ queryClient: QueryClient<IssueApi> }>();
// #endregion
