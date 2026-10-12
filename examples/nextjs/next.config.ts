import type { NextConfig } from "next";

export default {
	reactCompiler: true,
	transpilePackages: [
		"@examples/db",
		"@examples/ui",
		"@raf-query/core",
		"@raf-query/react",
	],
} satisfies NextConfig;
