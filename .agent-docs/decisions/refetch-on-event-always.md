# Focus / reconnect refetch: `boolean | "always"`, no function form (agent)

- **`refetchOnWindowFocus` / `refetchOnReconnect` take `"always"`** as a query option and a read option, with TanStack's meaning: a read query refetches on the event even when fresh (`onPlatformEvent` in `entry.ts`). Any reader's `"always"` wins, as any reader's `true` already did for stale data.
- **TanStack's function form `(query) => boolean | "always"` is left out.** `QueryBehavior` is shared by every factory and the client's `defaults`, so it isn't generic over the data: the function would get an untyped `Query` and need `Query.getUnsafe` to look inside it. Per read, the component already holds the data and controls, so it passes the value it wants on each render. Revisit if a query-level case needs it.
