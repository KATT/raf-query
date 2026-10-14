import { Button } from "@examples/ui/components/button";
import { Link } from "@tanstack/react-router";

import { firstDoc } from "~/content/docs.ts";

export function NotFound() {
	return (
		<main className="mx-auto grid max-w-xl place-items-center gap-4 px-6 py-24 text-center">
			<p className="font-mono text-sm text-muted-foreground">404</p>
			<h1 className="text-3xl font-semibold tracking-tight">
				This page isn’t in the cache
			</h1>
			<p className="text-muted-foreground">
				Or anywhere else. It may have moved; the docs are a search away.
			</p>
			<div className="flex gap-2">
				<Button asChild>
					<Link params={{ slug: firstDoc }} to="/docs/$slug">
						Read the docs
					</Link>
				</Button>
				<Button asChild variant="outline">
					<Link to="/">Home</Link>
				</Button>
			</div>
		</main>
	);
}
