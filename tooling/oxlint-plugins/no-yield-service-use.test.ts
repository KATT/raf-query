import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { markdownFences } from "./markdown-fences.ts";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

const rule = plugin.rules["no-yield-service-use"];

tester.run("no-yield-service-use", rule, {
	valid: [
		`const run = Effect.gen(function* () {
       const issues = yield* Issues;
       return yield* issues.list();
     });`,
		`const queryFn = () => Issues.use((issues) => issues.list());`,
		`const invalidateIssues = Issues.use((issues) => issues.invalidate());`,
		`runPromise(Issues.use((issues) => issues.list()));`,
		`function* steps() { yield issues.use(1); }`,
		`function* steps() { yield* context.use(handler); }`,
	],
	invalid: [
		{
			code: `const run = Effect.gen(function* () {
         return yield* Issues.use((issues) => issues.list());
       });`,
			errors: [
				{ messageId: "yieldUse", data: { local: "issues", service: "Issues" } },
			],
		},
		{
			code: `const run = Effect.fn("run")(function* () {
         const versions = yield* NpmRegistry.use((npm) => npm.versions("x")).pipe(
           Effect.provide(layer),
           Effect.flip,
         );
       });`,
			errors: [
				{
					messageId: "yieldUse",
					data: { local: "npmRegistry", service: "NpmRegistry" },
				},
			],
		},
	],
});

tester.run("no-yield-service-use in Markdown fences", rule, {
	valid: markdownFences(),
	invalid: [],
});
