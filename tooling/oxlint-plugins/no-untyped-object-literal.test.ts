import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { markdownFences } from "./markdown-fences.ts";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

const rule = plugin.rules["no-untyped-object-literal"];

tester.run("no-untyped-object-literal", rule, {
	valid: [
		`const mentionsTodo: Target<QueryMeta, number> = {
       where: (query, id) => query.queryKey.includes(id),
     };`,
		`const languages = { css: () => import("css") } satisfies Record<string, LanguageInput>;`,
		`const themes = { light: "", dark: ".dark" } as const satisfies Record<string, string>;`,
		`let options: QueryClientConfig = {};`,
		`await invalidateMany(qc, { where: (query) => query.data === undefined });`,
		`const timer = makeTimer({ at: 1 });`,
		`const { data } = useQuery(postQuery, handle);`,
		`const ids = [{ id: 1 }];`,
		`const post = posts[0] as Post;`,
	],
	invalid: [
		{
			code: `const mentionsTodo = {
         where: (query: QueryInfo, id: number) => query.queryKey.includes(id),
       };`,
			errors: [{ messageId: "untyped" }],
		},
		{
			code: `const themes = { light: "", dark: ".dark" } as const;`,
			errors: [{ messageId: "untyped" }],
		},
		{
			code: `let options = ({ staleTime: 0 });`,
			errors: [{ messageId: "untyped" }],
		},
		{
			code: `export const todo = { id: 1 }, other = {};`,
			errors: [{ messageId: "untyped" }, { messageId: "untyped" }],
		},
		{
			code: `function seed() {
         const todo = { id: 1, title: "Write tests" };
         setData(client, todoQuery, { id: 1 }, todo);
       }`,
			errors: [{ messageId: "untyped" }],
		},
	],
});

tester.run("no-untyped-object-literal in Markdown fences", rule, {
	valid: markdownFences(),
	invalid: [],
});
