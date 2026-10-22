/**
 * The demo's type switches: which tags each boundary catches, and how
 * `DocPage` reads its doc. `codeOf` is the code a combination stands for;
 * `build/effect-query-configs.ts` compiles every one with the real compiler
 * and writes what it said to `type-configs.gen.json`, which the code panel
 * shows. No imports, so that script runs this file too.
 */

export const switches = [
	{
		hint: "Off: both reads have it left",
		key: "network",
		label: "Network catches RpcClientError",
	},
	{
		hint: "Off: both reads have it left",
		key: "session",
		label: "Session catches Unauthorized",
	},
	{
		hint: "Off: DocPage has it left",
		key: "forbidden",
		label: "DocAccess catches Forbidden",
	},
	{
		hint: "Session already does",
		key: "accessUnauthorized",
		label: "DocAccess also catches Unauthorized",
	},
	{
		hint: "Then there’s nothing for DocPage to match",
		key: "accessNotFound",
		label: "DocAccess also catches DocNotFound",
	},
	{
		hint: "Off: Match.valueTags has a case missing",
		key: "match",
		label: "DocPage matches DocNotFound",
	},
	{
		hint: "No Result: what’s left goes to App",
		key: "dataHook",
		label: "DocPage uses the data hook",
	},
] as const;

export type SwitchKey = (typeof switches)[number]["key"];

export type Config = { readonly [K in SwitchKey]: boolean };

/** The chain the page's other examples use. */
export const defaultConfig: Config = {
	accessNotFound: false,
	accessUnauthorized: false,
	dataHook: false,
	forbidden: true,
	match: true,
	network: true,
	session: true,
};

/** With the data hook, there is no `Result` to match. */
export const matters = (config: Config, key: SwitchKey): boolean =>
	key !== "match" || !config.dataHook;

/** Its key in `type-configs.gen.json`: a bit per switch, `0` for one that doesn't matter. */
export const idOf = (config: Config): string =>
	switches
		.map((s) => (config[s.key] && matters(config, s.key) ? "1" : "0"))
		.join("");

/** Every combination, each once. */
export const allConfigs = (): ReadonlyArray<Config> => {
	const configs = new Map<string, Config>();
	for (let bits = 0; bits < 2 ** switches.length; bits++) {
		const on = (key: SwitchKey) =>
			(bits & (1 << switches.findIndex((s) => s.key === key))) !== 0;
		const config: Config = {
			accessNotFound: on("accessNotFound"),
			accessUnauthorized: on("accessUnauthorized"),
			dataHook: on("dataHook"),
			forbidden: on("forbidden"),
			match: on("match"),
			network: on("network"),
			session: on("session"),
		};
		configs.set(idOf(config), config);
	}
	return [...configs.values()];
};

/** A highlighted line: each token's text, and its color in the light and dark themes. */
export type Line = ReadonlyArray<readonly [string, string, string]>;

/** An error in a combination's code: its 0-based line and character, length, code, and its message's index in `texts`. */
export type Diagnostic = readonly [number, number, number, number, number];

/** A `// ^?`'s line, and the type's index in `texts`. */
export type Hover = readonly [number, number];

export interface Compiled {
	/** Each line's index in `lines`. */
	readonly code: ReadonlyArray<number>;
	readonly errors: ReadonlyArray<Diagnostic>;
	readonly hovers: ReadonlyArray<Hover>;
}

/** What `type-configs.gen.json` holds, keyed by `idOf`. */
export interface Generated {
	/** The TypeScript version that compiled them. */
	readonly compiler: string;
	readonly configs: Readonly<Record<string, Compiled>>;
	readonly lines: ReadonlyArray<Line>;
	readonly texts: ReadonlyArray<string>;
	/** The text color of the light and dark themes. */
	readonly theme: { readonly dark: string; readonly light: string };
}

export type Tag =
	| "RpcClientError"
	| "Unauthorized"
	| "Forbidden"
	| "DocNotFound";

export type Name = "App" | "Network" | "Session" | "DocAccess";

interface Link {
	readonly name: Exclude<Name, "App">;
	readonly parent: Name;
	readonly tags: ReadonlyArray<Tag>;
}

export interface Layout {
	/** The boundaries below the root, from the outside in. A boundary that catches nothing isn't there. */
	readonly links: ReadonlyArray<Link>;
	/** The boundary `DocList` reads through: the innermost of `App`, `Network`, `Session`. */
	readonly list: Name;
	/** The boundary `DocPage` reads through: the innermost. */
	readonly page: Name;
}

export const layoutOf = (config: Config): Layout => {
	const wanted: ReadonlyArray<{
		readonly name: Link["name"];
		readonly tags: ReadonlyArray<Tag | false>;
	}> = [
		{ name: "Network", tags: [config.network && "RpcClientError"] },
		{ name: "Session", tags: [config.session && "Unauthorized"] },
		{
			name: "DocAccess",
			tags: [
				config.forbidden && "Forbidden",
				config.accessUnauthorized && "Unauthorized",
				config.accessNotFound && "DocNotFound",
			],
		},
	];
	const links: Array<Link> = [];
	let parent: Name = "App";
	let list: Name = "App";
	for (const { name, tags } of wanted) {
		const caught = tags.filter((tag) => tag !== false);
		if (caught.length === 0) {
			continue;
		}
		links.push({ name, parent, tags: caught });
		parent = name;
		if (name !== "DocAccess") {
			list = name;
		}
	}
	return { links, list, page: parent };
};

/** What `ListDocs` and `GetDoc` can fail with: the session's, the transport's, and their own. */
const errorsOf = {
	list: ["Unauthorized", "RpcClientError"],
	page: ["Forbidden", "DocNotFound", "Unauthorized", "RpcClientError"],
} satisfies Record<"list" | "page", ReadonlyArray<Tag>>;

/** What's left of a reader's errors once its chain catches what it does. */
export const leftOf = (
	config: Config,
	reader: "list" | "page",
): ReadonlyArray<Tag> => {
	const caught = new Set(
		layoutOf(config)
			.links.filter((link) => reader === "page" || link.name !== "DocAccess")
			.flatMap((link) => link.tags),
	);
	return errorsOf[reader].filter((tag) => !caught.has(tag));
};

const hooksOf = (name: Name, layout: Layout, config: Config) => {
	const data =
		layout.list === name || (layout.page === name && config.dataHook);
	const result = layout.page === name && !config.dataHook;
	if (result) {
		return data
			? `${name}, use${name}, use${name}Result`
			: `${name}, , use${name}Result`;
	}
	return data ? `${name}, use${name}` : name;
};

/** The module a combination stands for: the chain, and the two components that read through it. */
export const codeOf = (config: Config): string => {
	const layout = layoutOf(config);
	const page = config.dataHook
		? [
				"export function DocPage(props: { id: number }) {",
				`\tconst doc = use${layout.page}(docQuery(props.id));`,
				"\t//    ^?",
				"\treturn <h1>{doc.title}</h1>;",
				"}",
			]
		: [
				"export function DocPage(props: { id: number }) {",
				`\tconst result = use${layout.page}Result(docQuery(props.id));`,
				"\t//    ^?",
				"\treturn Result.match(result, {",
				"\t\tonSuccess: (doc) => <h1>{doc.title}</h1>,",
				"\t\tonFailure: (error) =>",
				...(config.match
					? [
							"\t\t\tMatch.valueTags(error, {",
							"\t\t\t\tDocNotFound: (gone) => <p>Doc {gone.docId} is gone.</p>,",
							"\t\t\t}),",
						]
					: ["\t\t\tMatch.valueTags(error, {}),"]),
				"\t});",
				"}",
			];
	return [
		'import { Boundary } from "@raf-query/experimental-effect-query";',
		...(config.dataHook ? [] : ['import { Match, Result } from "effect";']),
		"",
		'import type { AppError } from "~/boundaries.tsx";',
		'import { client } from "~/client.ts";',
		'import { Caught, Crashed } from "~/fallbacks.tsx";',
		'import { docList, docQuery } from "~/queries.ts";',
		"",
		`export const [${hooksOf("App", layout, config)}] = Boundary.root({`,
		'\tname: "App",',
		"\tclient,",
		"\terrors: Boundary.errors<AppError>(),",
		"\tfallback: Crashed,",
		"});",
		...layout.links.flatMap((link) => [
			"",
			`export const [${hooksOf(link.name, layout, config)}] = Boundary.catchErrors(${link.parent}, {`,
			`\tname: "${link.name}",`,
			`\ttags: [${link.tags.map((tag) => `"${tag}"`).join(", ")}],`,
			"\tfallback: Caught,",
			"});",
		]),
		"",
		"export function DocList() {",
		`\tconst docs = use${layout.list}(docList);`,
		"\t//    ^?",
		"\treturn docs.map((doc) => <li key={doc.id}>{doc.title}</li>);",
		"}",
		"",
		...page,
	].join("\n");
};
