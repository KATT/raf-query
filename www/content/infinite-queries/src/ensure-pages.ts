import { QueryClient } from "@raf-query/react";

import { commentsQuery } from "./queries";

const qc = new QueryClient();
declare const slug: string;

// #region ensure-pages
const comments = await qc.ensure(commentsQuery, { slug }, { pages: 2 });
// #endregion

export { comments };
