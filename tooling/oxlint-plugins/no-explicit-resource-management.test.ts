import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run(
	"no-explicit-resource-management",
	plugin.rules["no-explicit-resource-management"],
	{
		valid: [
			`const timers = fakeTimers();
       try { run(); } finally { timers.restore(); }`,
			`const iterator = Symbol.iterator;`,
			`const options = { DisposableStack: 1 };`,
			`const value = globals.DisposableStack;`,
			`function using(x: number) { return x; }`,
		],
		invalid: [
			{
				code: `function run() { using timers = fakeTimers(); }`,
				errors: [{ messageId: "banned", data: { name: "using" } }],
			},
			{
				code: `async function run() { await using server = await listen(); }`,
				errors: [{ messageId: "banned", data: { name: "await using" } }],
			},
			{
				code: `const handle = { [Symbol.dispose]() {} };`,
				errors: [{ messageId: "banned", data: { name: "Symbol.dispose" } }],
			},
			{
				code: `const handle = { async [Symbol.asyncDispose]() {} };`,
				errors: [
					{ messageId: "banned", data: { name: "Symbol.asyncDispose" } },
				],
			},
			{
				code: `const stack = new DisposableStack();`,
				errors: [{ messageId: "banned", data: { name: "DisposableStack" } }],
			},
			{
				code: `const stack = new AsyncDisposableStack();`,
				errors: [
					{ messageId: "banned", data: { name: "AsyncDisposableStack" } },
				],
			},
		],
	},
);
