---
title: Plugins
description: Give a client its behaviors as plugins, set their per-query options in factories, give every queryFn a typed context, and bind the builders to the client that has them.
section: Guides
order: 20
---

A client's behavior beyond caching comes from its **plugins**: retries, polling, refetching on focus, and whatever your app adds. A plugin declares the per-query **options** it reads and the **context** it gives every `queryFn`. A query takes those options, and its `queryFn` gets that context, on the clients that have the plugin.

The per-query behavior that `recommended()` turns on is set this way, in the query's factory:

```sample
tanstack-start/src/docs/plugins.ts#intro
```

This `queryOptions` comes from the app's `raf.ts`, which [binds it to the client](#typing-options-by-the-client), so it takes the options of that client's plugins.

| Option                 | Declared by          | Use                                                                           |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `retry`                | `retry()`            | Attempts for this query, or `false`. See [Retries](./retries.md)              |
| `refetchInterval`      | `polling()`          | Refetch every `n` ms while read. See [Polling](./polling.md)                  |
| `refetchOnWindowFocus` | `focusRefetch()`     | `false` opts out. See [Window focus refetching](./window-focus-refetching.md) |
| `refetchOnReconnect`   | `reconnectRefetch()` | `false` opts out                                                              |

## Writing a plugin

`plugin()` makes a plugin. A plugin contributes any of four things, and each takes effect in its own place:

<figure class="doc-diagram">
<svg viewBox="0 0 780 324" role="img" aria-labelledby="plugin-anatomy-title">
<title id="plugin-anatomy-title">What a plugin has, and where each piece takes effect</title>
<defs><marker id="plugin-anatomy-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M1 1L9 5L1 9z"/></marker></defs>
<text class="head" x="20" y="24">A plugin has</text><text class="head" x="300" y="24">Where it takes effect</text>
<rect class="box" x="20" y="40" width="210" height="56" rx="8"/>
<text class="code" x="34" y="63">options</text>
<text class="note" x="34" y="82">declares the per-query options it reads</text>
<path class="arrow" d="M230 68H294" marker-end="url(#plugin-anatomy-arrow)"/>
<rect class="box" x="300" y="40" width="460" height="56" rx="8"/>
<text class="code" x="314" y="63">queryOptions({ retry: 1, … })</text>
<text class="note" x="314" y="82">a bound builder takes the option, typed</text>
<rect class="box" x="20" y="112" width="210" height="56" rx="8"/>
<text class="code" x="34" y="135">context</text>
<text class="note" x="34" y="154">values for every queryFn</text>
<path class="arrow" d="M230 140H294" marker-end="url(#plugin-anatomy-arrow)"/>
<rect class="box" x="300" y="112" width="460" height="56" rx="8"/>
<text class="code" x="314" y="135">queryFn: ({ api, signal }) =&gt; …</text>
<text class="note" x="314" y="154">the queryFn gets them, for the client or per request</text>
<rect class="box" x="20" y="184" width="210" height="56" rx="8"/>
<text class="code" x="34" y="207">link</text>
<text class="note" x="34" y="226">wraps every request</text>
<path class="arrow" d="M230 212H294" marker-end="url(#plugin-anatomy-arrow)"/>
<rect class="box" x="300" y="184" width="460" height="56" rx="8"/>
<text class="code" x="314" y="207">load → link → link → queryFn</text>
<text class="note" x="314" y="226">outermost first, in the order of the plugins array</text>
<rect class="box" x="20" y="256" width="210" height="56" rx="8"/>
<text class="code" x="34" y="279">setup</text>
<text class="note" x="34" y="298">a cache-wide behavior</text>
<path class="arrow" d="M230 284H294" marker-end="url(#plugin-anatomy-arrow)"/>
<rect class="box" x="300" y="256" width="460" height="56" rx="8"/>
<text class="code" x="314" y="279">&lt;QueryClientProvider client={…}&gt;</text>
<text class="note" x="314" y="298">started when a provider mounts the client; never on a server</text>
</svg>
<figcaption>What a plugin has, and where each piece takes effect.</figcaption>
</figure>

| Piece           | What it is                                     | Where it takes effect                                                          |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| **link**        | A function that wraps a request                | Around every request the client makes, the `queryFn` innermost                 |
| **`setup`**     | A function that makes the plugin a **feature** | Across the cache, from when a provider mounts the client until it unmounts     |
| **`context`**   | An object, or values its link adds per request | In every `queryFn` of the client, beside `client`, `queryKey` and `signal`     |
| **declaration** | An interface with `options` and `context`      | In the types: what factories and `defaults` can set, and what a `queryFn` gets |

A plugin with no link, `setup` or `context` only declares options.

The declaration is `plugin()`'s type argument: an interface with the `options` the plugin reads and the `context` it gives. Both are optional. It types the link's `op.options`, and a plugin that declares a `context` has to give it.

### A link

A link gets the request as `op` and calls `next(op)` to run the rest of the chain, like a [tRPC link](https://trpc.io/docs/client/links). The last link is the query's own `queryFn`. `op.options` has the query's options, over the client's [defaults](#client-wide-defaults), with the fields the plugin declares typed. `retry()` and `timeout(ms)` are plugins with a link.

```sample
tanstack-start/src/docs/plugins.ts#link
```

### A feature

`setup(client, signal)` runs when a provider mounts the client, and `signal` aborts when the last provider of that client unmounts. So a feature runs once however many providers share the client, and never during a server render. `focusRefetch()`, `reconnectRefetch()` and `polling()` are features. This one listens to the server with an [`EventSource`](https://developer.mozilla.org/en-US/docs/Web/API/EventSource):

```sample
tanstack-start/src/docs/plugins.ts#feature
```

### Context for every queryFn

A plugin's `context` is merged into the context of every `queryFn` the client runs, beside `client`, `queryKey` and `signal`. The declaration names its fields:

```sample
tanstack-start/src/docs/plugins.ts#context
```

A server makes one client per request, so a client's context belongs to that request: an API client that sends the request's cookies, a database reader for the signed-in user.

In a factory built with the `queryOptions` [bound to that client](#typing-options-by-the-client), the `queryFn` gets `api`, typed:

```sample
tanstack-start/src/docs/plugins.bind.tsx#context
```

### Context per request

A plugin can also give its context from its link, for values that belong to one request: a token that may need refreshing, a trace id. The link passes `next` an operation with the `context` it adds for the `queryFn` and the links after it. It goes over what the plugins before it gave (`op.context`), so a link can add a field or replace one, and the fields it leaves out stay:

```sample
tanstack-start/src/docs/plugins.request-context.ts#session
```

The declaration is the same, so a factory reads `token` the same way:

```sample
tanstack-start/src/docs/plugins.request-context.ts#read
```

A plugin that declares a context gives it one of the two ways. With no `context`, its link's `next` only takes an operation that has the declared fields, so this is a type error:

```sample
tanstack-start/src/docs/plugins.request-context.ts#missing
```

A link can replace a field another plugin gave the client, too, for the one request. A paged query's pages are one request: they share its context.

### Options only

A plugin without a link, a `setup` or a `context` does nothing at runtime. It declares options: your app's own facts about a query, for [targets to match on](#selecting-queries-by-options). [Tags](./query-invalidation.md#tags) are built this way.

```sample
tanstack-start/src/docs/plugins.ts#declaration
```

### The client's plugins

`createQueryClient` takes the plugins as one array. `recommended()` returns an array of plugins, so spread it among your own:

```sample
tanstack-start/src/docs/plugins.ts#root
```

Links wrap each request in array order, outermost first: `errorToasts` comes before `retry()`, so it sees a request's error only after its retries ran out. Order matters for links only, unless two plugins give the same context field: then the later plugin's wins.

A package that ships a plugin needs only these exports: `plugin`, the types `Plugin` and `Operation` (the request a link gets) to name what it returns and takes, and `Target` and `QueryInfo` for a [target](./query-invalidation.md#matching-with-where) that matches on the options it declares.

## Typing options by the client

A client's plugins decide what its queries can set and what their `queryFn`s get, so a builder always belongs to a client. `@raf-query/react` exports no `queryOptions` of its own: it exports binders, and an app binds its builders to its client once, in a file of their own. Every factory imports them from there:

```sample title="src/raf.ts"
tanstack-start/src/docs/plugins.bind.tsx#bind
```

<figure class="doc-diagram">
<svg viewBox="0 0 780 364" role="img" aria-labelledby="binding-title">
<title id="binding-title">How a builder is bound, in an app and in a library, and which clients run its factories</title>
<defs><marker id="binding-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M1 1L9 5L1 9z"/></marker></defs>
<text class="head" x="20" y="24">In an app</text>
<rect class="box" x="20" y="40" width="360" height="56" rx="8"/>
<text class="code" x="34" y="63">makeQueryClient()</text>
<text class="note" x="34" y="82">plugins: [retry(), api(), ownership]</text>
<path class="arrow" d="M200 96V118" marker-end="url(#binding-arrow)"/>
<rect class="box" x="20" y="124" width="360" height="56" rx="8"/>
<text class="code" x="34" y="147">bindQueryOptions&lt;typeof makeQueryClient&gt;()</text>
<text class="note" x="34" y="166">in raf.ts, once per client</text>
<path class="arrow" d="M200 180V202" marker-end="url(#binding-arrow)"/>
<rect class="box" x="20" y="208" width="360" height="56" rx="8"/>
<text class="code" x="34" y="231">postQuery</text>
<text class="note" x="34" y="250">may set retry and owner; its queryFn gets api</text>
<path class="arrow" d="M200 264V286" marker-end="url(#binding-arrow)"/>
<rect class="box result" x="20" y="292" width="360" height="56" rx="8"/>
<text class="code" x="34" y="315">runs on a client with all three</text>
<text class="note" x="34" y="334">not on a client made without api()</text>
<text class="head" x="400" y="24">In a library</text>
<rect class="box" x="400" y="40" width="360" height="56" rx="8"/>
<text class="code" x="414" y="63">interface Convex { context: … }</text>
<text class="note" x="414" y="82">the declaration of the library's plugin</text>
<path class="arrow" d="M580 96V118" marker-end="url(#binding-arrow)"/>
<rect class="box" x="400" y="124" width="360" height="56" rx="8"/>
<text class="code" x="414" y="147">bindQueryOptions&lt;Convex &amp; Optional&lt;Retry&gt;&gt;()</text>
<text class="note" x="414" y="166">names the plugins its factories need</text>
<path class="arrow" d="M580 180V202" marker-end="url(#binding-arrow)"/>
<rect class="box" x="400" y="208" width="360" height="56" rx="8"/>
<text class="code" x="414" y="231">convexQuery(ref)</text>
<text class="note" x="414" y="250">its queryFn gets convex; sets retry where there is one</text>
<path class="arrow" d="M580 264V286" marker-end="url(#binding-arrow)"/>
<rect class="box result" x="400" y="292" width="360" height="56" rx="8"/>
<text class="code" x="414" y="315">runs on any client with convex()</text>
<text class="note" x="414" y="334">with or without retry()</text>
</svg>
<figcaption>A builder is bound to a client in an app, or to plugin declarations in a library. Its factories run on the clients that have those plugins.</figcaption>
</figure>

The types flow one way. The client factory lists the plugins, the binders read that list from the factory's type, the builders they return type every factory, and a factory then runs on the clients that have those plugins.

Each binder takes the type of the function that makes the client, or of the client. Only the type is read, so `import type` is enough and the factories don't import the client. A binder returns the plain builder, typed for the client: binding costs a few bytes, and an app that doesn't page leaves out `bindInfiniteQueryOptions` and ships none of the paging code.

Factories built with the bound builders never name the client:

```sample
tanstack-start/src/docs/plugins.bind.tsx#bound
```

- They take the options the client's plugins declare, with their types. Anything else is a type error:

```sample
tanstack-start/src/docs/plugins.bind.tsx#bound-errors
```

- Their `queryFn` gets the context the client's plugins give.
- Verbs such as `invalidateMany` and `setData`, and `load` for each of its entries, take them only with a client that has those plugins. The bound `useQueryClient` returns the app's client, so verbs called in components take the app's factories:

```sample
tanstack-start/src/docs/plugins.bind.tsx#use-query-client
```

- `where` targets see the client's options, as [Selecting queries by options](#selecting-queries-by-options) shows.

The bare `QueryClient` type stands for any client, whatever its plugins. Verbs and `load` given one take the factories and targets that need no plugin, and reject the rest. The `useQueryClient` that `@raf-query/react` exports returns that type, which is why components get the client from the bound one. Wherever your app names its client's type, write `ReturnType<typeof makeQueryClient>`: TanStack Router's [router context](https://tanstack.com/router/latest/docs/framework/react/guide/router-context), a React Router [context](https://reactrouter.com/api/utils/createContext), a helper's parameter. `ClientFor<typeof factory>` is any client that runs that factory:

```sample
tanstack-start/src/docs/plugins.bind.tsx#client-type
```

A binder takes the type of a function, not of a client at module level, because a server makes one client per request. It's the same idea as a [tRPC v12](https://github.com/trpc/trpc/tree/v12) client typing its call options from its links.

### Several clients

Nothing is registered globally, so a program can have several clients with different plugins. A client runs a factory when it has **at least** the plugins the factory's builder is bound to. Bind a builder to one client for the factories only it runs, and to the plugins several clients share, named by their declarations, for the factories they all run. `Retry`, `Polling`, `FocusRefetch` and `ReconnectRefetch` are the declarations of the built-in plugins; intersect them to name more than one (`Retry & Polling`).

```sample
tanstack-start/src/docs/plugins.clients.ts#clients
```

Each client runs the shared factory, and only the site's client runs the one that polls. The last call is a type error:

```sample
tanstack-start/src/docs/plugins.clients.ts#running
```

### Options several factories share

`OptionsOf<typeof makeQueryClient>` is what the client's builders let a query set beside its key and `queryFn`: the core's options and those of the client's plugins. Use it to type a fragment that several factories spread:

```sample
tanstack-start/src/docs/plugins.bind.tsx#options-of
```

## Client-wide defaults

`defaults` sets an option for every query of the client: the core's `staleTime`, `gcTime` and `structuralSharing`, and any option the client's plugins declare. A query's own option wins.

```sample
tanstack-start/src/docs/plugins.clients.ts#defaults
```

`defaults` is typed by the `plugins` of the same call, so a default for an option no plugin declares is an error:

```sample
tanstack-start/src/docs/plugins.clients.ts#defaults-errors
```

## Selecting queries by options

A `where` target picks queries by what their options say. Written inline, `query.options` has the options of the client the verb is called with:

```sample
tanstack-start/src/docs/plugins.where.ts#selecting-queries-by-options
```

A target kept in a variable is typed `Target<TOptions, TParam>`, by the options it reads and the parameter it takes:

```sample
tanstack-start/src/docs/plugins.where.ts#target
```

`RootOf<Ownership>["options"]` is `owner` the way a client with the plugin has it: present, and possibly `undefined`. Typed that way, `ownedBy` fits only clients made with `ownership`. Typed `Target<Ownership["options"], Team>`, where `owner` is optional, it would also fit a client without the plugin, and match nothing there.

See [Query invalidation](./query-invalidation.md#matching-with-where) for targets, and for tags, which are targets over an option.

## Binding a library to plugins

A package that ships factories can't name the app's client. It binds its builders to the declarations of the plugins its factories need. `Optional<…>` names a plugin they don't need: its options can be set, and they take effect on the clients that have the plugin.

```sample
tanstack-start/src/docs/plugins.library.ts#library
```

The app gives its client the package's plugin, and the package's factories run on it. On a client without the plugin, here the last one, they're a type error:

```sample
tanstack-start/src/docs/plugins.library.ts#app
```

A package whose factories need no plugin calls `bindQueryOptions()` without a type argument. That builder takes the core's options only (`staleTime`, `gcTime`, `structuralSharing`, `ssr`), its `queryFn` gets `client`, `queryKey` and `signal`, and its factories run on any client:

```sample
tanstack-start/src/docs/plugins.any-client.ts#any-client
```

## Serialization

Options aren't sent with dehydrated state during SSR: they come from the factory, so they can hold anything, functions included. An entry only hydrated, which nothing has read through its factory yet, has `{}` as its options until it's read. Invalidations still reach it: they're checked again when the entry is next read.

A plugin's context isn't sent either. Each client has its own, from the plugins it was made with.
