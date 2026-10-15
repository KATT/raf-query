import { defineRule } from "@oxlint/plugins";

/**
 * Library code targets ES2024, which has no explicit resource management:
 * no `using` / `await using`, `Symbol.dispose` / `Symbol.asyncDispose`, or
 * `DisposableStack` / `AsyncDisposableStack`. Tests may use them; the
 * packages' `lib` includes `ESNext.Disposable` for their sake, so `tsc`
 * doesn't catch it.
 */

const DISPOSE_SYMBOLS = new Set(["asyncDispose", "dispose"]);
const STACKS = new Set(["AsyncDisposableStack", "DisposableStack"]);

const noExplicitResourceManagement = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow `using`, `Symbol.dispose` and `DisposableStack` in code that targets ES2024",
		},
		schema: [],
		messages: {
			banned:
				"`{{name}}` isn't in ES2024, which library code targets. Clean up with `try` / `finally` or an Effect `Scope`.",
		},
	},

	create(context) {
		return {
			VariableDeclaration(node) {
				if (node.kind === "using" || node.kind === "await using") {
					context.report({
						node,
						messageId: "banned",
						data: { name: node.kind },
					});
				}
			},

			MemberExpression(node) {
				if (
					!node.computed &&
					node.object.type === "Identifier" &&
					node.object.name === "Symbol" &&
					node.property.type === "Identifier" &&
					DISPOSE_SYMBOLS.has(node.property.name)
				) {
					context.report({
						node,
						messageId: "banned",
						data: { name: `Symbol.${node.property.name}` },
					});
				}
			},

			Identifier(node) {
				if (!STACKS.has(node.name)) {
					return;
				}
				const parent = node.parent;
				const isProperty =
					(parent?.type === "MemberExpression" &&
						parent.property === node &&
						!parent.computed) ||
					(parent?.type === "Property" &&
						parent.key === node &&
						!parent.computed);
				if (!isProperty) {
					context.report({
						node,
						messageId: "banned",
						data: { name: node.name },
					});
				}
			},
		};
	},
});

export { noExplicitResourceManagement };
