---
title: Installation
description: Install @raf-query/react with npm, pnpm, Yarn or Bun.
section: Getting started
order: 2
---

Apps install one package, `@raf-query/react`. It re-exports everything from `@raf-query/core`, so you never import core directly.

```bash
npm install @raf-query/react
# or
pnpm add @raf-query/react
# or
yarn add @raf-query/react
# or
bun add @raf-query/react
```

`QueryBoundary`, an error boundary for a query's [typed errors](./query-functions.md#expected-errors), is a package of its own:

```bash
npm install @raf-query/boundary
```

## Requirements

- **React 19.2 or newer.** raf-query reads data with `use()` and relies on transitions, Actions and `useOptimistic`.
- **Node.js 22 or newer** for server rendering.

## Subpath entries

The parts not every app needs are subpath exports of the same package, so there is nothing else to install, and an app that doesn't import one doesn't bundle it:

| Import                             | For                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `@raf-query/react/groups`          | [Groups and tags](./query-keys.md#groups) to invalidate sets of queries            |
| `@raf-query/react/hydration`       | `dehydrate` and `hydrate` for [SSR without an integration](./ssr-and-hydration.md) |
| `@raf-query/react/tanstack-router` | [TanStack Start and TanStack Router](./tanstack-start.md) SSR streaming            |
| `@raf-query/react/devtools`        | The [devtools](./devtools.md) panel; omit the element to tree-shake it             |

[React Server Components](./react-server-components.md) apps, such as the Next.js App Router, and [React Router Framework Mode](./react-router.md) need no integration subpath: `QueryProvider` and `HydrationBoundary` come from `@raf-query/react`.

`@tanstack/react-router` is an optional peer: only apps that import `/tanstack-router` need it.

## TypeScript

raf-query is written in TypeScript and ships its types. Query data, inputs and errors are inferred from your [query factories](./query-factories.md), so most apps never write a type argument. TypeScript 5.5 or newer with `strict` is recommended.

Next, build your first page in the [quick start](./quick-start.md).
