# The docs say why `useQuery` takes the factory and the handle (human)

- `useQuery(factory, handle)` names the factory next to the handle on purpose: the handle is plain data, `{ queryKey, input }`, so it can cross from a loader or a server component to the browser, and a function can't, so it can't carry the `queryFn`.
- The docs say so in one sentence next to the first `useQuery` in `www/content/quick-start.md` and in "Reading a handle" in `www/content/handles.md`.
- Lost: a handle that carries its factory (not serializable), and leaving the double naming unexplained.
