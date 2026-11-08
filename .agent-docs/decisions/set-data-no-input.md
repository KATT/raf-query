# `setData` skips the input of a factory that takes none (human asked; details agent)

- `setData(client, factory, updater)` for a factory whose input can be left out (`[] extends Parameters<TFactory>`: no parameter, or an optional one), `setData(client, factory, input, updater)` otherwise. Two overloads in `verbs.ts`; the short one's rest parameter is `never` for a factory with a required input, so leaving the input out is a type error there.
- A factory with no parameter can't take the long form (its `input` is `never`), the way `InputArgs` gives the other verbs no input slot for it. An optional input takes either form.
- At runtime the forms differ by argument count, not by whether the third argument is a function: data can be a function, and a plain value in the short form would otherwise read as an input.
- Tests: `types.test-d.ts` ("skip the input of setData only for a factory that takes none"), `verbs.test.ts` ("writes a query without an input, from three arguments").
