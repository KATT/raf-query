import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { markdownFences } from "./markdown-fences.ts";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

const rule = plugin.rules["no-pipe-on-effect-fn"];

tester.run("no-pipe-on-effect-fn", rule, {
	valid: [
		`const rename = Effect.fn("rename")(
       function* (input: Input) {
         return yield* issues.rename(input);
       },
       Effect.withSpan("rename"),
     );`,
		`const run = Effect.gen(function* () {
       return 1;
     }).pipe(Effect.withSpan("run"));`,
		`const result = rename(input).pipe(Effect.orDie);`,
		`const result = Effect.fn("rename")(function* () {})(input).pipe(Effect.orDie);`,
	],
	invalid: [
		{
			code: `const rename = Effect.fn("rename")(function* (input: Input) {
         return yield* issues.rename(input);
       }).pipe(Effect.withSpan("rename"));`,
			errors: [{ messageId: "pipe" }],
		},
		{
			code: `const validate = Effect.fnUntraced(function* (size: number) {
         return size;
       }).pipe(Effect.orDie);`,
			errors: [{ messageId: "pipe" }],
		},
	],
});

tester.run("no-pipe-on-effect-fn in Markdown fences", rule, {
	valid: markdownFences(),
	invalid: [],
});
