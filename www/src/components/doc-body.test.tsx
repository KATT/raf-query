import path from "node:path";

import { describe, expect, it, vi } from "@effect/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";

import { renderMarkdown } from "../../build/markdown.ts";
import type { DocSegment } from "~/content/types.ts";

import { DocBody } from "./doc-body.tsx";

// `pnpm test` runs in `www/`.
const contentDir = path.resolve("content");

let segments: ReadonlyArray<DocSegment> = [];

function Page() {
	return <DocBody demos={{}} segments={segments} />;
}

const rootRoute = createRootRoute({ component: Page });

function clipboard() {
	const writeText = vi.fn<(text: string) => Promise<void>>(() =>
		Promise.resolve(),
	);
	const original = navigator.clipboard;
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText },
	});
	return {
		[Symbol.dispose]() {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: original,
			});
		},
		writeText,
	};
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

async function renderPage(next: ReadonlyArray<DocSegment>) {
	segments = next;
	const router = createRouter({
		history: createMemoryHistory({ initialEntries: ["/"] }),
		routeTree: rootRoute,
		scrollRestoration: () => false,
	});
	await act(async () => {
		render(<RouterProvider router={router} />);
		await router.load();
	});
}

describe("DocBody code folds", () => {
	it("opens the folded lines and copies them", async () => {
		using copied = clipboard();
		const rendered = await renderMarkdown(
			[
				"```ts",
				"const shown = 1;",
				"// ---collapse---",
				"const hidden = 2;",
				"// ---/collapse---",
				"```",
			].join("\n"),
			{ twoslashRoot: contentDir },
		);
		const html = rendered.segments[0];
		if (html?.kind !== "html") {
			throw new Error("expected html");
		}
		await renderPage([html]);

		const fold = screen.getByRole("button", { name: "1 collapsed line" });
		expect(fold.getAttribute("aria-expanded")).toBe("false");
		await click(fold);
		expect(fold.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByRole("button", { name: "Hide 1 line" })).toBe(fold);
		expect(
			document.querySelector(".code-collapse-body")?.hasAttribute("hidden"),
		).toBe(false);

		await click(fold);
		expect(fold.getAttribute("aria-expanded")).toBe("false");
		expect(
			document.querySelector(".code-collapse-body")?.hasAttribute("hidden"),
		).toBe(true);

		await click(screen.getByRole("button", { name: "Copy code" }));
		expect(copied.writeText).toHaveBeenCalledWith(
			"const shown = 1;\nconst hidden = 2;",
		);
	});
});
