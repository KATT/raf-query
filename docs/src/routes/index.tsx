import { Badge } from "@examples/ui/components/badge";
import { Button } from "@examples/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Cable,
	FileCode2,
	Link2,
	Radio,
	Send,
	Server,
	Sparkles,
	SquareStack,
} from "lucide-react";
import type { ReactNode } from "react";

import home from "../../content/_home.md";
import { DocBody } from "~/components/doc-body.tsx";
import { DemoEmbed } from "~/components/demo-embed.tsx";
import { firstDoc } from "~/content/docs.ts";
import { demoQuery } from "~/demos/registry.ts";
import { pageHead } from "~/seo.ts";
import { site } from "~/site.ts";

export const Route = createFileRoute("/")({
	loader: (args) => ({
		demo: args.context.queryClient.prefetch(demoQuery, {
			id: "starting-queries",
		}),
	}),
	head: () =>
		pageHead({
			description: site.description,
			path: "/",
			structuredData: [
				{
					"@type": "WebSite",
					description: site.description,
					name: site.name,
					url: site.url,
				},
				{
					"@type": "SoftwareSourceCode",
					codeRepository: site.github,
					description: site.description,
					license: "https://opensource.org/licenses/MIT",
					name: site.name,
					programmingLanguage: ["TypeScript", "React"],
					runtimePlatform: "Node.js, browsers",
					url: site.url,
				},
			],
		}),
	component: HomePage,
});

const features: ReadonlyArray<{
	readonly body: ReactNode;
	readonly icon: ReactNode;
	readonly slug: string;
	readonly title: string;
}> = [
	{
		body: "Route loaders and server components start every query a page needs, in parallel, before anything renders.",
		icon: <Send />,
		slug: "starting-queries",
		title: "Fetch where React recommends",
	},
	{
		body: "A handle is just a key and an input. It crosses the loader, the server and the client without carrying data.",
		icon: <Link2 />,
		slug: "handles",
		title: "Small, serializable handles",
	},
	{
		body: "useQuery returns a stable promise; unwrap it with use() wherever the data is needed, even in a child.",
		icon: <SquareStack />,
		slug: "reading-queries",
		title: "Promises in, use() out",
	},
	{
		body: "Filters, sort and pages live in the URL. whilePending picks between suspending and keeping the previous page.",
		icon: <Radio />,
		slug: "url-state-and-pagination",
		title: "The URL is the input",
	},
	{
		body: "No useMutation: write in form actions, then invalidate. React's useOptimistic and useActionState do the rest.",
		icon: <Cable />,
		slug: "mutations",
		title: "Actions for writes",
	},
	{
		body: "The server's cache streams to the browser as queries settle, in TanStack Start and in Next.js App Router.",
		icon: <Server />,
		slug: "ssr-and-hydration",
		title: "Streaming SSR and RSC",
	},
];

const mapping: ReadonlyArray<readonly [string, string]> = [
	["queryClient.prefetchQuery()", "qc.prefetch(factory, input)"],
	["queryClient.ensureQueryData()", "qc.ensure(factory, input)"],
	["queryClient.fetchQuery()", "qc.fetch(factory, input)"],
	["useSuspenseQuery()", "use(useQuery(factory, handle)[0])"],
	["useInfiniteQuery()", "useQuery() with an infiniteQueryOptions factory"],
	["placeholderData: keepPreviousData", 'whilePending: "previous"'],
	["useMutation()", "Actions + qc.invalidate()"],
	["invalidateQueries(filters)", "qc.invalidate(filter)"],
];

function HomePage() {
	const data = Route.useLoaderData();
	return (
		<main>
			<section className="relative overflow-hidden border-b">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
				/>
				<div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-24">
					<div className="grid gap-6">
						<Badge className="w-fit" variant="outline">
							<Sparkles /> Early · 0.x on npm
						</Badge>
						<h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
							Render-as-you-fetch data fetching for React
						</h1>
						<p className="max-w-xl text-lg text-pretty text-muted-foreground">
							Queries start in route loaders and React Server Components, travel
							to components as small serializable{" "}
							<strong className="text-foreground">handles</strong>, and are read
							with React’s <code className="font-mono text-base">use()</code>{" "}
							under Suspense. The cache works like{" "}
							<a
								className="font-medium text-foreground underline underline-offset-4"
								href="https://tanstack.com/query"
							>
								TanStack Query
							</a>
							’s.
						</p>
						<div className="flex flex-wrap gap-3">
							<Button asChild size="lg">
								<Link params={{ slug: "quick-start" }} to="/docs/$slug">
									Get started <ArrowRight />
								</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link params={{ slug: firstDoc }} to="/docs/$slug">
									Read the overview
								</Link>
							</Button>
						</div>
						<p className="font-mono text-sm text-muted-foreground">
							<span className="select-none">$ </span>pnpm add @raf-query/react
							effect
						</p>
					</div>
					<div className="min-w-0">
						<DocBody demos={{}} segments={home.segments} />
					</div>
				</div>
			</section>

			<section
				aria-labelledby="principles"
				className="mx-auto max-w-7xl px-4 py-16 sm:px-6"
			>
				<h2
					className="mb-2 text-2xl font-semibold tracking-tight"
					id="principles"
				>
					Built around how React wants data
				</h2>
				<p className="mb-8 max-w-2xl text-muted-foreground">
					Fetch-on-render is an explicitly named escape hatch, not the default.
					Every page starts its queries before it renders.
				</p>
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{features.map((feature) => (
						<li key={feature.slug}>
							<Link
								className="grid h-full gap-2 rounded-xl border bg-card p-5 transition-colors hover:bg-accent/50 [&_svg]:size-5"
								params={{ slug: feature.slug }}
								to="/docs/$slug"
							>
								<span className="text-muted-foreground">{feature.icon}</span>
								<span className="font-semibold">{feature.title}</span>
								<span className="text-sm text-muted-foreground">
									{feature.body}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="try-it" className="border-y bg-muted/30 py-16">
				<div className="mx-auto max-w-5xl px-4 sm:px-6">
					<h2
						className="mb-2 text-2xl font-semibold tracking-tight"
						id="try-it"
					>
						Try it: prefetch or ensure
					</h2>
					<p className="max-w-2xl text-muted-foreground">
						Every guide has live demos like this one. Each runs its own query
						client against a fake server in your browser, with the requests and
						the cache shown underneath.
					</p>
					<DemoEmbed handle={data.demo} />
				</div>
			</section>

			<section
				aria-labelledby="tanstack"
				className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2"
			>
				<div className="grid content-start gap-4">
					<h2 className="text-2xl font-semibold tracking-tight" id="tanstack">
						Standing on TanStack Query’s shoulders
					</h2>
					<p className="text-muted-foreground">
						The cache’s mechanics follow{" "}
						<a
							className="font-medium text-foreground underline underline-offset-4"
							href="https://tanstack.com/query"
						>
							TanStack Query
						</a>{" "}
						closely: query keys, deduping, staleness, garbage collection,
						retries, structural sharing, infinite pages, focus and reconnect
						refetching. If you know TanStack Query, you already know how
						raf-query caches. What changes is where queries start and how
						components read them.
					</p>
					<div className="flex flex-wrap gap-3">
						<Button asChild variant="outline">
							<Link params={{ slug: "comparison" }} to="/docs/$slug">
								<FileCode2 /> Compare with TanStack Query
							</Link>
						</Button>
						<Button asChild variant="ghost">
							<Link params={{ slug: "credits" }} to="/docs/$slug">
								Credits
							</Link>
						</Button>
					</div>
				</div>
				<div className="overflow-x-auto rounded-xl border">
					<table className="w-full text-sm">
						<thead className="bg-muted/50 text-left">
							<tr>
								<th className="px-4 py-2 font-medium">TanStack Query</th>
								<th className="px-4 py-2 font-medium">raf-query</th>
							</tr>
						</thead>
						<tbody>
							{mapping.map(([from, to]) => (
								<tr className="border-t" key={from}>
									<td className="px-4 py-2 font-mono text-xs text-muted-foreground">
										{from}
									</td>
									<td className="px-4 py-2 font-mono text-xs">{to}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</main>
	);
}
