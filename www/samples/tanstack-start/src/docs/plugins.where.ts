import { type ApiClient, makeQueryClient, type Ownership } from "./plugins.ts";

declare const apiClient: ApiClient;

// #region selecting-queries-by-options
import { invalidateMany } from "@raf-query/react";

const qc = makeQueryClient(apiClient);

await invalidateMany(qc, {
	where: (query) => query.options.owner === "community",
	//                              ^?
});
// #endregion

// #region target
import type { RootOf, Target } from "@raf-query/react";

type Team = NonNullable<Ownership["options"]["owner"]>;

// `owner` the way a client with `ownership` has it: present, possibly `undefined`
type Owned = RootOf<Ownership>["options"];

const ownedBy: Target<Owned, Team> = {
	where: (query, team) => query.options.owner === team,
};

await invalidateMany(qc, ownedBy, "editorial");
// #endregion
