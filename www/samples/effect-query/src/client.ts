import { QueryClient } from "@raf-query/experimental-effect-query";
import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import type { RpcClientError } from "effect/rpc/RpcClientError";

import { DocRpcs } from "./api.ts";

/** The RPC client: `docs.GetDoc({ id })` is an Effect that fails with the procedure's errors. */
export class DocsClient extends Context.Service<
	DocsClient,
	RpcClient.FromGroup<typeof DocRpcs, RpcClientError>
>()("docs/DocsClient") {
	static layer = Layer.effect(DocsClient, RpcClient.make(DocRpcs)).pipe(
		Layer.provide(RpcClient.layerProtocolHttp({ url: "/rpc" })),
		Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
	);
}

// #region client
export const client = QueryClient.make(DocsClient.layer);
// #endregion
