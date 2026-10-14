import { QueryClient } from "@raf-query/react";

import { postQuery } from "./queries";

const qc = new QueryClient();
declare const slug: string;

// #region invalidate-basics
await qc.invalidate(postQuery, { slug });

// Every query whose key starts with ["posts"]
await qc.invalidate({ queryKey: ["posts"] });
// #endregion

export { qc };
