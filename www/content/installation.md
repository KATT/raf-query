---
title: Installation
description: Install @raf-query/react and its Effect peer dependency with npm, pnpm, Yarn or Bun.
section: Getting started
order: 2
---

Apps install one package, `@raf-query/react`. It re-exports everything from `@raf-query/core`, so you never import core directly.

```bash
npm install @raf-query/react
# or
pnpm add @raf-query/react
# or
bun add @raf-query/react
```

With Yarn, also add `effect`, because Yarn doesn't install peer dependencies on its own:

```bash
yarn add @raf-query/react effect
```

## Requirements

- **React 19.2 or newer.** raf-query reads data with `use()` and relies on transitions, Actions and `useOptimistic`.
- **`effect` 4.x** as a peer dependency. The cache is written in [Effect](https://effect.website), but an app that doesn't use Effect never imports it: `queryFn`s return promises, and the client, hooks and integrations speak promises. npm, pnpm and Bun install the peer automatically. An app that does use Effect shares one copy with raf-query.
- **Node.js 22 or newer** for server rendering.

## Framework integrations

The integrations are subpath exports of the same package, so there is nothing else to install:

| Import                             | For                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `@raf-query/react/tanstack-router` | [TanStack Start and TanStack Router](./tanstack-start.md) SSR streaming |
| `@raf-query/react/rsc`             | [React Server Components](./nextjs.md), such as the Next.js App Router  |
| `@raf-query/react/devtools`        | The [devtools](./devtools.md) panel; omit the element to tree-shake it  |

`@tanstack/react-router` is an optional peer: only apps that import `/tanstack-router` need it.

## TypeScript

raf-query is written in TypeScript and ships its types. Query data, inputs and errors are inferred from your [query factories](./query-factories.md), so most apps never write a type argument. TypeScript 5.5 or newer with `strict` is recommended.

Next, build your first page in the [quick start](./quick-start.md).
