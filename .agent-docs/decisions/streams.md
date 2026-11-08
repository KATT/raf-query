# Streams are async iterables with a reducer (human decided)

- A `queryFn` that returns an async iterable is a stream. Its factory passes `stream: { initial, reduce }`, and the kernel folds each chunk into the entry's data. The `queryFn` gets `{ signal }`; aborting it ends the iteration.
- `ReadableStream`s are already async iterable, and an `EventSource` wraps in a few lines of async generator.
- Why: no Observable (see [kernel-subscribe.md](./kernel-subscribe.md)), and the stream shape stays on the factory options rather than a separate constructor.
- Where: `packages/core/src/options.ts`, `entry.ts`.
