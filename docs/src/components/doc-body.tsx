import type { QueryHandle } from "@raf-query/react";
import { useRouter } from "@tanstack/react-router";

import type { DocSegment } from "~/content/types.ts";
import type { demoQuery } from "~/demos/registry.ts";

import { DemoEmbed } from "./demo-embed.tsx";

function isElement(target: EventTarget | null): target is Element {
	return target !== null && "closest" in target;
}

function internalHref(target: EventTarget | null, root: HTMLElement) {
	if (!isElement(target)) {
		return undefined;
	}
	const anchor = target.closest("a");
	if (!anchor || !root.contains(anchor) || anchor.target) {
		return undefined;
	}
	const url = new URL(anchor.href, window.location.href);
	if (
		url.origin !== window.location.origin ||
		!url.pathname.startsWith("/docs/")
	) {
		return undefined;
	}
	if (url.pathname === window.location.pathname && url.hash) {
		return undefined;
	}
	return url.pathname + url.hash;
}

/**
 * A page's prerendered HTML, with its demos in between. Links between pages
 * navigate client-side and preload on hover, like the router's `<Link>`.
 */
export function DocBody(props: {
	readonly demos: Readonly<Record<string, QueryHandle<typeof demoQuery>>>;
	readonly segments: ReadonlyArray<DocSegment>;
}) {
	const router = useRouter();
	return (
		<div
			className="prose prose-neutral max-w-none dark:prose-invert"
			onClick={(event) => {
				const target = event.target;
				const copy = isElement(target)
					? target.closest("button[data-copy]")
					: null;
				if (copy) {
					const code = copy.parentElement?.querySelector("pre")?.textContent;
					if (code) {
						void navigator.clipboard.writeText(code).then(() => {
							copy.textContent = "Copied";
							setTimeout(() => {
								copy.textContent = "Copy";
							}, 1500);
						});
					}
					return;
				}
				if (
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				) {
					return;
				}
				const href = internalHref(target, event.currentTarget);
				if (href) {
					event.preventDefault();
					void router.navigate({ to: href });
				}
			}}
			onPointerOver={(event) => {
				const href = internalHref(event.target, event.currentTarget);
				if (href) {
					void router.preloadRoute({ to: href });
				}
			}}
		>
			{props.segments.map((segment, index) =>
				segment.kind === "html" ? (
					<div
						// oxlint-disable-next-line react/no-danger -- build-time HTML from our own markdown
						dangerouslySetInnerHTML={{ __html: segment.html }}
						// Segments are a fixed list per page.
						// oxlint-disable-next-line react/no-array-index-key
						key={index}
					/>
				) : (
					<DemoEmbed handle={props.demos[segment.id]} key={segment.id} />
				),
			)}
		</div>
	);
}
