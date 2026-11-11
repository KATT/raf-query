---
title: Parts, options and context
description: Give a client its behaviors as parts, set their per-query options in factories, give every queryFn a typed context, and bind the builders to the client that has them.
section: Guides
order: 20
---

A client's behavior beyond caching comes from its **parts**: retries, polling, refetching on focus, and whatever your app adds. A part declares the per-query **options** it reads and the **context** it gives every `queryFn`. A query takes those options, and its `queryFn` gets that context, on the clients that have the part.

The per-query behavior that `recommended()` turns on is set this way, in the query's factory:

```sample
tanstack-start/src/docs/links-and-features.ts#intro
```

This `queryOptions` comes from the app's `raf.ts`, which [binds it to the client](#typing-options-by-the-client). The one `@raf-query/react` exports takes the core's options only.

| Option                 | Declared by          | Use                                                                           |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `retry`                | `retry()`            | Attempts for this query, or `false`. See [Retries](./retries.md)              |
| `refetchInterval`      | `polling()`          | Refetch every `n` ms while read. See [Polling](./polling.md)                  |
| `refetchOnWindowFocus` | `focusRefetch()`     | `false` opts out. See [Window focus refetching](./window-focus-refetching.md) |
| `refetchOnReconnect`   | `reconnectRefetch()` | `false` opts out                                                              |

## Parts

`part()` makes a part. A part has any of:

- a **link**, which wraps every request the client makes
- a **`setup`** function, which makes it a **feature**: a cache-wide behavior that runs while the client is mounted
- a **`context`** object, whose fields every `queryFn` of the client gets
- none of them: it only declares options

Its type argument is the part's **declaration**, an interface with the `options` it reads and the `context` it gives. Both are optional. The declaration types the link's `op.options`, and a part that declares a `context` has to give it.

### A link

A link gets the request as `op` and calls `next(op)` to run the rest of the chain, like a [tRPC link](https://trpc.io/docs/client/links). The last link is the query's own `queryFn`. `op.options` has the query's options, over the client's [defaults](#client-wide-defaults), with the fields the part declares typed. `retry()` and `timeout(ms)` are parts with a link.

```sample
tanstack-start/src/docs/links-and-features.ts#link
```

### A feature

`setup(client, signal)` runs when a provider mounts the client, and `signal` aborts when the last provider of that client unmounts. So a feature runs once however many providers share the client, and never during a server render. `focusRefetch()`, `reconnectRefetch()` and `polling()` are features. This one listens to the server with an [`EventSource`](https://developer.mozilla.org/en-US/docs/Web/API/EventSource):

```sample
tanstack-start/src/docs/links-and-features.ts#feature
```

### Context for every queryFn

A part's `context` is merged into the context of every `queryFn` the client runs, beside `client`, `queryKey` and `signal`. The declaration names its fields, and `client.context` holds them:

```sample
tanstack-start/src/docs/links-and-features.ts#context
```

A server makes one client per request, so a client's context belongs to that request: an API client that sends the request's cookies, a database reader for the signed-in user.

In a factory whose builder is [bound to the client](#typing-options-by-the-client), the `queryFn` gets `api`, typed:

```sample
tanstack-start/src/docs/links-and-features.bind.tsx#context
```

### Options only

A part without a link, a `setup` or a `context` does nothing at runtime. It declares options: your app's own facts about a query, for [targets to match on](#selecting-queries-by-options). [Tags](./query-invalidation.md#tags) are built this way.

```sample
tanstack-start/src/docs/links-and-features.ts#declaration
```

### The client's parts

`createQueryClient` takes the parts as one array. `recommended()` returns an array of parts, so spread it among your own:

```sample
tanstack-start/src/docs/links-and-features.ts#root
```

Links wrap each request in array order, outermost first: `errorToasts` comes before `retry()`, so it sees a request's error only after its retries ran out. Order matters for links only, unless two parts give the same context field: then the later part's wins.

A package that ships a part needs only these exports: `part`, the types `Part` and `Operation` (the request a link gets) to name what it returns and takes, and `Target` and `QueryInfo` for a [target](./query-invalidation.md#matching-with-where) that matches on the options it declares.

## Typing options by the client

A client's parts decide what its queries can set. The `queryOptions` and `infiniteQueryOptions` that `@raf-query/react` exports belong to no client, so they take the core's options only (`staleTime`, `gcTime`, `structuralSharing`, `ssr`), their `queryFn` gets `client`, `queryKey` and `signal`, and their factories run on every client:

```sample
tanstack-start/src/docs/links-and-features.unbound.ts#unbound
```

The last call is a type error: `retry` isn't one of the core's options.

For the options and the context of a client's parts, bind the builders to the client once, in a file of their own, and import them from there instead of from `@raf-query/react`:

```sample title="src/raf.ts"
tanstack-start/src/docs/links-and-features.bind.tsx#bind
```

Each binder takes the type of the function that makes the client, or of the client. Only the type is read, so `import type` is enough and the factories don't import the client. A binder returns the plain builder, typed for the client: binding costs a few bytes, and an app that doesn't page leaves out `bindInfiniteQueryOptions` and ships none of the paging code.

Factories built with the bound builders never name the client:

```sample
tanstack-start/src/docs/links-and-features.bind.tsx#bound
```

- They take the options the client's parts declare, with their types. Anything else is a type error:

```sample
tanstack-start/src/docs/links-and-features.bind.tsx#bound-errors
```

- Their `queryFn` gets the context the client's parts give.
- Verbs such as `invalidateMany` and `setData`, and `load` for each of its entries, take them only with a client that has those parts. The bound `useQueryClient` returns the app's client, so verbs called in components take the app's factories:

```sample
tanstack-start/src/docs/links-and-features.bind.tsx#use-query-client
```

- `where` targets see the client's options, as [Selecting queries by options](#selecting-queries-by-options) shows.

The bare `QueryClient` type stands for any client, whatever its parts. Verbs given one take the factories and targets that need no part, and reject the rest. The `useQueryClient` that `@raf-query/react` exports returns that type. Where your app names its client's type, such as a router's context or a helper's parameter, write `ReturnType<typeof makeQueryClient>`, or `ClientFor<typeof factory>` for any client that runs that factory:

```sample
tanstack-start/src/docs/links-and-features.bind.tsx#client-type
```

A binder takes the type of a function, not of a client at module level, because a server makes one client per request. It's the same idea as a [tRPC v12](https://github.com/trpc/trpc/tree/v12) client typing its call options from its links.

### Several clients

Nothing is registered globally, so a program can have several clients with different parts. A client runs a factory when it has **at least** the parts the factory's builder is bound to. Bind a builder to one client for the factories only it runs, and to the parts several clients share, named by their declarations, for the factories they all run. `Retry`, `Polling`, `FocusRefetch` and `ReconnectRefetch` are the declarations of the built-in parts; intersect them to name more than one (`Retry & Polling`).

```sample
tanstack-start/src/docs/links-and-features.clients.ts#clients
```

Each client runs the shared factory, and only the site's client runs the one that polls. The last call is a type error:

```sample
tanstack-start/src/docs/links-and-features.clients.ts#running
```

### Options several factories share

`OptionsOf<typeof makeQueryClient>` is what a bound builder lets a query set beside its key and `queryFn`: the core's options and those of the client's parts. Use it to type a fragment that several factories spread:

```sample
tanstack-start/src/docs/links-and-features.bind.tsx#options-of
```

## Client-wide defaults

`defaults` sets an option for every query of the client: the core's `staleTime`, `gcTime` and `structuralSharing`, and any option the client's parts declare. A query's own option wins.

```sample
tanstack-start/src/docs/links-and-features.clients.ts#defaults
```

`defaults` is typed by the `parts` of the same call, so a default for an option no part declares is an error:

```sample
tanstack-start/src/docs/links-and-features.clients.ts#defaults-errors
```

## Selecting queries by options

A `where` target picks queries by what their options say. Written inline, `query.options` has the options of the client the verb is called with:

```sample
tanstack-start/src/docs/links-and-features.where.ts#selecting-queries-by-options
```

A target kept in a variable is typed `Target<TOptions, TParam>`, by the options it reads and the parameter it takes:

```sample
tanstack-start/src/docs/links-and-features.where.ts#target
```

`RootOf<Ownership>["options"]` is `owner` the way a client with the part has it: present, and possibly `undefined`. Typed that way, `ownedBy` fits only clients made with `ownership`. Typed `Target<Ownership["options"], Team>`, where `owner` is optional, it would also fit a client without the part, and match nothing there.

See [Query invalidation](./query-invalidation.md#matching-with-where) for targets, and for tags, which are targets over an option.

## Binding a library to parts

A package that ships factories can't name the app's client. It binds its builders to the declarations of the parts its factories need. `Optional<…>` names a part they don't need: its options can be set, and they take effect on the clients that have the part.

```sample
tanstack-start/src/docs/links-and-features.library.ts#library
```

The app gives its client the package's part, and the package's factories run on it. On a client without the part, here the last one, they're a type error:

```sample
tanstack-start/src/docs/links-and-features.library.ts#app
```

## Serialization

Options aren't sent with dehydrated state during SSR: they come from the factory, so they can hold anything, functions included. An entry only hydrated, which nothing has read through its factory yet, has `{}` as its options until it's read. Invalidations still reach it: they're checked again when the entry is next read.

A part's context isn't sent either. Each client has its own, from the parts it was made with.
