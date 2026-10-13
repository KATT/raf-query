import type { NextConfig } from "next";

export default {
	// CodeSandbox serves the dev server at `<id>-<port>.csb.app`.
	allowedDevOrigins: ["*.csb.app"],
	reactCompiler: true,
	transpilePackages: [
		"@examples/api",
		"@examples/db",
		"@examples/ui",
		"@raf-query/core",
		"@raf-query/react",
	],
} satisfies NextConfig;
