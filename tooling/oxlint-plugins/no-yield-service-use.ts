import { defineRule } from "@oxlint/plugins";

/**
 * Inside a generator, yield the service and call it:
 * `const issues = yield* Issues`, then `yield* issues.list()`. Bans
 * `yield* Issues.use((issues) => issues.list())`, piped or not.
 * `Service.use(f)` stays fine as a whole expression outside a generator.
 */

function stripPipes(node) {
	let current = node;
	while (
		current?.type === "CallExpression" &&
		current.callee.type === "MemberExpression" &&
		!current.callee.computed &&
		current.callee.property.type === "Identifier" &&
		current.callee.property.name === "pipe"
	) {
		current = current.callee.object;
	}
	return current;
}

function isServiceUse(node) {
	if (node?.type !== "CallExpression") {
		return false;
	}
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.property.type === "Identifier" &&
		callee.property.name === "use" &&
		callee.object.type === "Identifier" &&
		/^[A-Z]/.test(callee.object.name)
	);
}

const noYieldServiceUse = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Disallow `yield* Service.use(...)` inside generators",
		},
		schema: [],
		messages: {
			yieldUse:
				"Yield the service, then call it: `const {{local}} = yield* {{service}};`.",
		},
	},

	create(context) {
		return {
			YieldExpression(node) {
				if (!node.delegate) {
					return;
				}
				const call = stripPipes(node.argument);
				if (!isServiceUse(call)) {
					return;
				}
				const service = call.callee.object.name;
				context.report({
					node,
					messageId: "yieldUse",
					data: {
						local: service[0].toLowerCase() + service.slice(1),
						service,
					},
				});
			},
		};
	},
});

export { noYieldServiceUse };
