import { QueryClient } from "@raf-query/react";

import { updatePost } from "./api";
import { postQuery } from "./queries";

const qc = new QueryClient();
declare const slug: string;
declare const title: string;

// #region set-data-from-response
const updated = await updatePost({ slug, title });
qc.setData(postQuery, { slug }, updated);
// #endregion
