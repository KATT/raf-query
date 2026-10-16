import { defineRule } from "@oxlint/plugins";

/**
 * `Effect.fn` / `Effect.fnUntraced` take combinators as extra arguments after
 * the generator: `Effect.fn("name")(function* () {…}, Effect.withSpan(…))`.
 * Bans `.pipe(…)` on what they return.
 */

const FN_NAMES = new Set(["fn", "fnUntraced"]);

function isEffectFn(node) {
	return (
		node?.type === "MemberExpression" &&
		!node.computed &&
		node.object.type === "Identifier" &&
		node.object.name === "Effect" &&
		node.property.type === "Identifier" &&
		FN_NAMES.has(node.property.name)
	);
}

/** `Effect.fn(gen)`, `Effect.fnUntraced(gen)` or `Effect.fn("name")(gen)`. */
function isEffectFnResult(node) {
	if (node?.type !== "CallExpression") {
		return false;
	}
	return (
		isEffectFn(node.callee) ||
		(node.callee.type === "CallExpression" && isEffectFn(node.callee.callee))
	);
}

const noPipeOnEffectFn = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Disallow `.pipe` on the result of `Effect.fn`",
		},
		schema: [],
		messages: {
			pipe: "Pass combinators to `Effect.fn` after the generator instead of `.pipe` on its result.",
		},
	},

	create(context) {
		return {
			MemberExpression(node) {
				if (
					!node.computed &&
					node.property.type === "Identifier" &&
					node.property.name === "pipe" &&
					isEffectFnResult(node.object)
				) {
					context.report({ node, messageId: "pipe" });
				}
			},
		};
	},
});

export { noPipeOnEffectFn };
