import { DEFAULT_LOADER_VERB } from "@examples/db/types";
import type { NextConfig } from "next";

export default {
	// CodeSandbox serves the dev server at `<id>-<port>.csb.app`.
	allowedDevOrigins: ["*.csb.app"],
	reactCompiler: true,
	// `/issues…` without a verb: the same page under the default one.
	redirects: () =>
		Promise.resolve([
			{
				destination: `/${DEFAULT_LOADER_VERB}/issues/:path*`,
				permanent: false,
				source: "/issues/:path*",
			},
		]),
	transpilePackages: [
		"@examples/api",
		"@examples/db",
		"@examples/kit",
		"@examples/ui",
		"@raf-query/core",
		"@raf-query/react",
	],
} satisfies NextConfig;
