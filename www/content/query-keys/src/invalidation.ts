/* oxlint-disable no-unused-expressions -- example query keys as standalone expressions */
import { QueryClient } from "@raf-query/react";

const qc = new QueryClient();

// #region invalidation
["issues", "list", { projectId: 3, status: "open" }];
["issues", "detail", 42];
["issues", "comments", 42];

await qc.invalidate({ queryKey: ["issues"] }); // all three
await qc.invalidate({ queryKey: ["issues", "list", { projectId: 3 }] }); // every list in project 3
// #endregion
