---
title: Installation
description: Install @raf-query/react, check the requirements, and pick the integration for your framework.
section: Getting started
order: 2
---

Install one package, `@raf-query/react`. It re-exports everything from `@raf-query/core`, so apps never import core directly.

```bash
npm install @raf-query/react
# or
pnpm add @raf-query/react
# or
yarn add @raf-query/react
# or
bun add @raf-query/react
```

## Requirements

- **React 19.2 or newer.** raf-query reads data with `use()` and relies on transitions, Actions and `useOptimistic`.
- **Node.js 22 or newer** for server rendering.
- **TypeScript 5.5 or newer** with `strict`, if you use TypeScript. Data, inputs and errors are inferred from your [query factories](./query-factories.md), so most apps never write a type argument.

## Pick your integration

raf-query needs a place that runs before rendering, to start the page's queries. Each framework has one, and its integration page sets up the client, the provider and server rendering:

| Framework                                                                                       | Queries start in                                            | Guide                                                   |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| [TanStack Start](https://tanstack.com/start) or [TanStack Router](https://tanstack.com/router)  | Route loaders, in the browser and during SSR                | [TanStack Start](./tanstack-start.md)                   |
| [Next.js App Router](https://nextjs.org/docs/app), or another React Server Components framework | Server components                                           | [React Server Components](./react-server-components.md) |
| [React Router](https://reactrouter.com) Framework Mode                                          | Server `loader`s, with a query client per request           | [React Router](./react-router.md#server-rendering)      |
| React Router SPA Mode or Data Mode                                                              | `clientLoader`s, or a Data Router's loaders, in the browser | [React Router](./react-router.md#client-only-apps)      |
| Anything else                                                                                   | Your router's loaders, or your own code before it navigates | [Starting queries](./starting-queries.md)               |

Not sure which shape fits? The [quick start](./quick-start.md) builds the same page in the first three.

## One entry point

Everything comes from `@raf-query/react`: the hooks, the client, hydration and the [devtools](./devtools.md). An app bundles only what it imports, so hydration and the devtools cost nothing until it uses them.

The one subpath, `@raf-query/react/tanstack-router`, is the TanStack Router integration. It needs `@tanstack/react-router`, an optional peer dependency. React Server Components and React Router need no integration entry.
