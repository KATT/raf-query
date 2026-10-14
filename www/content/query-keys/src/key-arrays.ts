/* oxlint-disable no-unused-expressions, typescript/no-deprecated -- example query keys; `status` is a field name, not Window.status */
import type { QueryKey } from "@raf-query/react";

export type KeyArrayExamples = QueryKey;

declare const status: string;
declare const page: number;

// #region object-keys-hash-same
["todos", { status, page }];
["todos", { page, status }];
["todos", { page, status, other: undefined }];
// #endregion

// #region array-order-differs
["todos", status, page];
["todos", page, status];
["todos", undefined, page, status];
// #endregion
