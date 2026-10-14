import { Button } from "@examples/ui/components/button";
import { Link } from "@tanstack/react-router";

import { firstDoc } from "~/content/docs.ts";
import { site } from "~/site.ts";

import { GitHubIcon } from "./icons.tsx";
import { LogoMark } from "./logo.tsx";
import { MobileNav } from "./mobile-nav.tsx";
import { SearchButton } from "./search.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export function SiteHeader() {
	return (
		<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
			<div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
				<MobileNav />
				<Link
					aria-label={`${site.name} home`}
					className="mr-4 flex items-center gap-2 font-semibold tracking-tight"
					to="/"
				>
					<LogoMark className="size-6" />
					{site.name}
				</Link>
				<nav
					aria-label="Main"
					className="hidden items-center gap-1 text-sm md:flex"
				>
					<Button asChild size="sm" variant="ghost">
						<Link
							activeProps={{ className: "text-foreground" }}
							className="text-muted-foreground"
							params={{ slug: firstDoc }}
							to="/docs/$slug"
						>
							Docs
						</Link>
					</Button>
					<Button asChild size="sm" variant="ghost">
						<Link
							className="text-muted-foreground"
							params={{ slug: "examples" }}
							to="/docs/$slug"
						>
							Examples
						</Link>
					</Button>
					<Button asChild size="sm" variant="ghost">
						<Link
							className="text-muted-foreground"
							params={{ slug: "api-reference" }}
							to="/docs/$slug"
						>
							API
						</Link>
					</Button>
				</nav>
				<div className="ml-auto flex items-center gap-1">
					<SearchButton />
					<Button asChild size="icon-sm" variant="ghost">
						<a aria-label="raf-query on GitHub" href={site.github}>
							<GitHubIcon />
						</a>
					</Button>
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
