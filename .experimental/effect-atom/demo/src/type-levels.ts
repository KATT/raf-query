/**
 * The type controls: switches that change how the boundaries and components
 * are written, and the code each combination gives. `scripts/type-levels.ts`
 * compiles every combination with TypeScript and writes what it says to
 * `type-levels.gen.json`; the panel looks the current one up there, so no
 * compiler ships to the browser.
 */

export const switches = [
	{
		hint: "errors: Boundary.errors<AppError>()",
		id: "universe",
		label: "The root declares its errors",
	},
	{
		hint: 'Session: tags: ["Unauthorized"]',
		id: "session",
		label: "Session catches `Unauthorized`",
	},
	{
		hint: 'DocAccess: tags: ["Forbidden"]',
		id: "forbidden",
		label: "DocAccess catches `Forbidden`",
	},
	{
		hint: 'tags: ["Forbiden"]',
		id: "typo",
		label: "…spelled `Forbiden`",
	},
	{
		hint: 'DocAccess: tags: [… "DocNotFound"]',
		id: "notFound",
		label: "DocAccess catches `DocNotFound`",
	},
	{
		hint: 'DocAccess: tags: [… "Unauthorized"]',
		id: "unauthorized",
		label: "DocAccess also catches `Unauthorized`",
	},
	{
		hint: "Match.valueTags(doc.error, { DocNotFound })",
		id: "matchNotFound",
		label: "DocPage handles `DocNotFound`",
	},
	{
		hint: "no Boundary.isUnhandled(doc) first",
		id: "unchecked",
		label: "DocPage reads `.title` without `isUnhandled`",
	},
] as const;

export type SwitchId = (typeof switches)[number]["id"];

export type Levels = { readonly [K in SwitchId]: boolean };

export const defaults = {
	forbidden: true,
	matchNotFound: true,
	notFound: false,
	session: true,
	typo: false,
	unauthorized: false,
	unchecked: false,
	universe: true,
} satisfies Levels;

/** Whether a switch does anything, given the others: a typo needs the tag, a match needs the check. */
export const applies = (levels: Levels, id: SwitchId): boolean => {
	switch (id) {
		case "typo":
			return levels.forbidden;
		case "matchNotFound":
			return !levels.unchecked;
		default:
			return true;
	}
};

/** `levels` with the switches that don't apply turned off, so equal code has one key. */
const effective = (levels: Levels): Levels => ({
	...levels,
	matchNotFound: levels.matchNotFound && applies(levels, "matchNotFound"),
	typo: levels.typo && applies(levels, "typo"),
});

export const keyOf = (levels: Levels): string =>
	switches.map((s) => (effective(levels)[s.id] ? "1" : "0")).join("");

/** Every distinct combination, by key. */
export const allLevels = (): ReadonlyArray<Levels> => {
	const byKey = new Map<string, Levels>();
	for (let bits = 0; bits < 2 ** switches.length; bits++) {
		const on = (id: SwitchId) =>
			(bits & (1 << switches.findIndex((s) => s.id === id))) !== 0;
		const levels = effective({
			forbidden: on("forbidden"),
			matchNotFound: on("matchNotFound"),
			notFound: on("notFound"),
			session: on("session"),
			typo: on("typo"),
			unauthorized: on("unauthorized"),
			unchecked: on("unchecked"),
			universe: on("universe"),
		});
		byKey.set(keyOf(levels), levels);
	}
	return [...byKey.values()];
};

/** Which of the demo's runnable chains a combination is, or `undefined` if the demo has none for it. */
export const variantOf = (
	levels: Levels,
): "docAccess" | "docAccessAll" | undefined => {
	const l = effective(levels);
	if (!l.universe || !l.session || !l.forbidden || l.typo || l.unauthorized) {
		return undefined;
	}
	return l.notFound ? "docAccessAll" : "docAccess";
};

const list = (tags: ReadonlyArray<string>) =>
	`[${tags.map((tag) => `"${tag}"`).join(", ")}]`;

/** The code for `levels`, as the panel shows it. */
export const codeFor = (levels: Levels): string => {
	const l = effective(levels);
	const accessTags = [
		...(l.forbidden ? [l.typo ? "Forbiden" : "Forbidden"] : []),
		...(l.notFound ? ["DocNotFound"] : []),
		...(l.unauthorized ? ["Unauthorized"] : []),
	];
	const lines = [
		`import { Boundary } from "@raf-query/experimental-effect-atom";`,
		`import { Match } from "effect";`,
		``,
		`import type { DocRpcs } from "./api.ts";`,
		`import { docAtom, docListAtom } from "./atoms.ts";`,
		``,
		`type AppError = Boundary.RpcErrors<typeof DocRpcs>;`,
		``,
		`const [App] = Boundary.root({`,
		...(l.universe ? [`\terrors: Boundary.errors<AppError>(),`] : []),
		`\tfallback: Crashed,`,
		`\tname: "App",`,
		`});`,
		`const [Network, useNetwork] = Boundary.catchErrors(App, {`,
		`\tfallback: Offline,`,
		`\tname: "Network",`,
		`\ttags: ["RpcClientError"],`,
		`});`,
	];
	let parent = "Network";
	if (l.session) {
		lines.push(
			`const [Session, useSession] = Boundary.catchErrors(Network, {`,
			`\tfallback: SignIn,`,
			`\tname: "Session",`,
			`\ttags: ["Unauthorized"],`,
			`});`,
		);
		parent = "Session";
	}
	const listHook = `use${parent}`;
	if (accessTags.length > 0) {
		lines.push(
			`const [DocAccess, useDocAccess] = Boundary.catchErrors(${parent}, {`,
			`\tfallback: RequestAccess,`,
			`\tname: "DocAccess",`,
			`\ttags: ${list(accessTags)},`,
			`});`,
		);
		parent = "DocAccess";
	}
	lines.push(
		``,
		`export const DocList = () => {`,
		`\tconst docs = ${listHook}(docListAtom);`,
		`\treturn docs.map((doc) => <a key={doc.id}>{doc.title}</a>);`,
		`};`,
		``,
		`export const DocPage = (props: { readonly id: number }) => {`,
		`\tconst doc = use${parent}(docAtom(props.id));`,
	);
	if (!l.unchecked) {
		lines.push(
			`\tif (Boundary.isUnhandled(doc)) {`,
			`\t\treturn Match.valueTags(doc.error, {`,
			...(l.matchNotFound
				? [`\t\t\tDocNotFound: (missing) => \`No doc \${missing.docId}\`,`]
				: []),
			`\t\t});`,
			`\t}`,
		);
	}
	lines.push(`\treturn <h1>{doc.title}</h1>;`, `};`);
	return `${lines.join("\n")}\n`;
};

/** Appended to the code before compiling it, and not shown: the fallbacks it names. */
export const hidden = `
declare function Crashed(props: Boundary.RootFallbackProps): null;
declare function Offline(props: Boundary.FallbackProps<AppError>): null;
declare function SignIn(props: Boundary.FallbackProps<AppError>): null;
declare function RequestAccess(props: Boundary.FallbackProps<AppError>): null;
`;

/** What `scripts/type-levels.ts` writes for each key. */
export interface Compiled {
	readonly diagnostics: ReadonlyArray<{
		readonly code: number;
		/** 0-based, in the visible code. */
		readonly column: number;
		readonly length: number;
		/** 1-based, in the visible code. */
		readonly line: number;
		readonly message: string;
	}>;
	/** The type of each `docs` and `doc` binding, as an editor's hover shows it. */
	readonly hovers: ReadonlyArray<{
		readonly column: number;
		readonly length: number;
		readonly line: number;
		readonly text: string;
	}>;
}
