import { posts } from "~/queries.ts";

declare function freshToken(): Promise<string>;
declare function getDrafts(
	token: string,
	init: { signal: AbortSignal },
): Promise<ReadonlyArray<string>>;

// #region session
import { plugin } from "@raf-query/react";

interface Session {
	readonly context: { readonly token: string };
}

// No `context` here: the link gives it, to every request.
const session = plugin<Session>({
	link: async (op, next) =>
		next({ ...op, context: { ...op.context, token: await freshToken() } }),
});
// #endregion

// #region read
import { bindQueryOptions, createQueryClient } from "@raf-query/react";

const makeQueryClient = () => createQueryClient({ plugins: [session] });
const queryOptions = bindQueryOptions<typeof makeQueryClient>();

export function draftsQuery() {
	return queryOptions({
		queryKey: posts("drafts"),
		queryFn: ({ token, signal }) => getDrafts(token, { signal }),
	});
}
// #endregion

// #region missing
// @ts-expect-error -- 2345: this link passes on an operation without `token`
plugin<Session>({ link: (op, next) => next(op) });
// #endregion
