import { Context, Effect, Layer } from "effect";

import { type Issue, IssueNotFound, IssueRepo } from "./issue-repo";

export class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<Issue, IssueNotFound> }
>()("app/IssueApi") {}

export const IssueApiLive = Layer.succeed(IssueApi, { get: IssueRepo.get });
