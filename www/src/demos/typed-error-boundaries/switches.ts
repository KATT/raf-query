/**
 * The type switches. `build/type-controls.ts` writes the chain and the
 * component for every configuration, compiles them, and saves what `tsc`
 * says to `type-controls.gen.json`; the demo shows it and runs the
 * configurations that compile.
 */
export const typeSwitches = [
	{ id: "session", label: "Session catches Unauthorized" },
	{ id: "access", label: "DocAccess catches Forbidden" },
	{ id: "twice", label: "DocAccess also catches Unauthorized" },
	{ id: "exists", label: "DocExists catches DocNotFound" },
	{ id: "unchecked", label: "Read .title without checking isUnhandled" },
] as const;

export type SwitchId = (typeof typeSwitches)[number]["id"];

export type TypeConfig = { readonly [K in SwitchId]: boolean };

export const initialTypeConfig: TypeConfig = {
	access: true,
	exists: false,
	session: true,
	twice: false,
	unchecked: false,
};

/** With `DocExists`, nothing is left to check, so there's no check to skip. */
export function normalize(config: TypeConfig): TypeConfig {
	return config.exists ? { ...config, unchecked: false } : config;
}

export function isDisabled(config: TypeConfig, id: SwitchId) {
	return id === "unchecked" && config.exists;
}

export function keyOf(config: TypeConfig) {
	return typeSwitches.map((each) => (config[each.id] ? "1" : "0")).join("");
}

const both = [true, false] as const;

export function allTypeConfigs(): ReadonlyArray<TypeConfig> {
	const configs = new Map<string, TypeConfig>();
	for (const session of both) {
		for (const access of both) {
			for (const twice of both) {
				for (const exists of both) {
					for (const unchecked of both) {
						const config = normalize({
							access,
							exists,
							session,
							twice,
							unchecked,
						});
						configs.set(keyOf(config), config);
					}
				}
			}
		}
	}
	return [...configs.values()];
}

/**
 * The chains the demo can run. The generator fails when a configuration
 * compiles and isn't one of them, or is one and doesn't compile.
 */
export function runnableChain(config: TypeConfig) {
	if (!config.access || config.unchecked || config.session === config.twice) {
		return undefined;
	}
	return `${config.session ? "session" : "twice"}-${config.exists ? "exists" : "inline"}` as const;
}

export type ChainId = NonNullable<ReturnType<typeof runnableChain>>;
