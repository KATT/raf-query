# Samples build a query's input at the call (human)

- Pull out the value, then build the input where the query is started: `const { slug } = args.params;` then `qc.ensure(postQuery, { slug })`. Don't build a shared `const input = { slug: args.params.slug }` and pass it around: a mistake in it is reported at the call that rejects it, far from the line that built it.
- An input that comes whole from a schema or parser (`IssueListInput.parse(...)` in `nextjs.md`) can be passed as is; its type is set where it's made.
