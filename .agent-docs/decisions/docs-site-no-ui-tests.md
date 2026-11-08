# No tests of the docs site's UI (human asked)

Human, on a timing-dependent docs test failing CI: "looks like it failed by some dumb test that should be deleted … do a sweep and fix/delete other tests like it".

- Applies [testing.md](./testing.md)'s "don't unit test the docs site's presentation": no Testing Library tests of demos (they read the page between a click and the fake server's response), and no tests of the homepage framework mode (URL `mode` parsing, the before-paint script) or the framework pill's layout math. Lost: a check that the demo's three verbs keep their request order, and that `?mode=` picks the right homepage tab; a look at the preview covers both.
- `www`'s tests are the build's (`www/build/*.test.ts`: sample expansion, code folding), which run in Node with no DOM. `www` doesn't depend on Testing Library or happy-dom.
- Behavior a demo shows belongs in `packages/*` tests, against the library.
