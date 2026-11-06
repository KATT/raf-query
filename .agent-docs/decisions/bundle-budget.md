# The base bundle stays under 5 kB gzip (human asked)

- The base is `fixtures/hooks.tsx` in `tooling/bundle-size`: a client, `load` and `useQuery`, with no links, features or hydration, React external. `pnpm bundle-size` fails past 5 kB gzip, and CI runs it (job "Bundle Size").
- Where: `tooling/bundle-size/src/scenarios.ts` (`budget`).
