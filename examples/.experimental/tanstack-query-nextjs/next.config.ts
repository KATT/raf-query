import type { NextConfig } from "next";

export default {
	reactCompiler: true,
	transpilePackages: [
		"@examples/db",
		"@examples/ui",
		"@raf-query/experimental-tanstack-react-query",
	],
} satisfies NextConfig;
