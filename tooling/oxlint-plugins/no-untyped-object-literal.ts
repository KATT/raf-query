import { defineRule } from "@oxlint/plugins";

/**
 * Require a type on every object literal bound to a variable: an annotation
 * (`const options: QueryClientConfig = { … }`) or `satisfies`
 * (`const where = { … } satisfies Target`). A standalone object shows its
 * readers which public type it fills in, and a typo in a key is an error
 * where it's written. Literals passed straight to a call are typed by the
 * parameter, so they're fine.
 */

function unwrap(node) {
	let current = node;
	while (
		current?.type === "ParenthesizedExpression" ||
		(current?.type === "TSAsExpression" &&
			current.typeAnnotation.type === "TSTypeReference" &&
			current.typeAnnotation.typeName.type === "Identifier" &&
			current.typeAnnotation.typeName.name === "const")
	) {
		current = current.expression;
	}
	return current;
}

const noUntypedObjectLiteral = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require a type annotation or `satisfies` on object literals bound to a variable",
		},
		schema: [],
		messages: {
			untyped:
				"Give this object its public type: `const name: Type = { … }` or `{ … } satisfies Type`.",
		},
	},

	create(context) {
		return {
			VariableDeclarator(node) {
				if (node.id.typeAnnotation) {
					return;
				}
				if (unwrap(node.init)?.type === "ObjectExpression") {
					context.report({ node, messageId: "untyped" });
				}
			},
		};
	},
});

export { noUntypedObjectLiteral };
