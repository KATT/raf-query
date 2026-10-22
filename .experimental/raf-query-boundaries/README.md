# Experiment: typed error boundaries in `@raf-query/react`

Typed error boundaries for Effect queries, built into the published packages: `@raf-query/react/boundary`, on top of `@raf-query/core` keeping a failed first load's `Cause`. A chain of boundaries reads like an Effect pipeline laid over the component tree: the root catches defects, and each boundary below it is a `catchTags` for its subtree. A read returns the data, or what the chain leaves as an `Unhandled`; plain data once nothing is left.

```tsx
import type { DocRpcs } from "./api.ts";

type AppError = Boundary.RpcErrors<typeof DocRpcs>;

const [App, useApp] = Boundary.root({
	client,
	errors: Boundary.errors<AppError>(),
	fallback: Crashed,
	name: "App",
});
const [Session, useSession] = Boundary.catchErrors(App, {
	fallback: SignIn,
	name: "Session",
	tags: ["Unauthorized"],
});

const docs = useSession(docListQuery, list); // DocSummary[]: nothing is left
const doc = useSession(docQuery, handle); // Doc | Unhandled<Forbidden | DocNotFound | RpcClientError>
const run = Boundary.useRun(Session); // run(effect): Promise<A | Unhandled<…>>
```

Boundaries name errors by tag, checked against the root's error universe, so `boundaries.tsx` and the components import the contract with `import type` only.

The guide is the docs page [Typed error boundaries](../../www/content/typed-error-boundaries.md). This folder holds the demo it was built from.

| Path    | Package                                       | Role                                                                                |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `demo/` | `@examples/experimental-raf-query-boundaries` | A docs app over an in-browser Effect RPC server, with chaos switches                |
| —       | `@raf-query/react/boundary`                   | The boundaries ([`packages/react/src/boundary`](../../packages/react/src/boundary)) |

```shell
pnpm --filter @examples/experimental-raf-query-boundaries dev         # http://localhost:3012
pnpm --filter @examples/experimental-raf-query-boundaries typecheck   # tsc, and the type-error fixtures are up to date
pnpm --filter @examples/experimental-raf-query-boundaries type-errors # rewrite src/type-errors.gen.json
```

`demo/type-errors/` holds files that must not compile (`*.fails.tsx`) and one that must (`*.compiles.tsx`), numbered in the order the tab shows them. `scripts/type-errors.ts` runs tsc over them and writes what it said to the demo's "Type errors" tab.

## Making it real

1. Drop "experimental" from the docs page and its nav entry.
2. Move the demo's app into `examples/` only if the four example apps all grow boundaries: they are the same app four times.
3. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
