import { QueryClient } from "@raf-query/react";

import { IssueApiLive } from "./issue-api";
import { issueQuery } from "./service-query";

// #region query-client
const queryClient = new QueryClient({ layer: IssueApiLive }); // QueryClient<IssueApi>
// oxlint-disable-next-line no-unused-vars -- sample shows prefetch's return value
const handle = queryClient.prefetch(issueQuery, { id: 1 });

await queryClient.dispose();
// #endregion
