import { describe, expect, it, vi } from "@effect/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";

import { DemoFrame } from "~/demo-kit/frame.tsx";
import { createFakeServer } from "~/demo-kit/server.ts";
import demo from "./starting-queries.tsx";

function serverOf(label: string) {
	const variant = demo.variants.find((each) => each.label === label);
	if (!variant) {
		throw new Error(`No variant ${label}`);
	}
	return variant.server;
}

function requestsOf(label: string) {
	return serverOf(label)
		.getRequests()
		.map((request) => `${request.label} ${request.status}`);
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

async function renderDemo(latency = 40): Promise<Disposable> {
	for (const variant of demo.variants) {
		variant.server.latency = latency;
	}
	await act(async () => {
		render(<DemoFrame demo={demo} />);
	});
	// Sessions outlive a render, as on the page, so start each test from
	// Reset's fresh clients and servers.
	await click(screen.getByRole("button", { name: "Reset" }));
	return { [Symbol.dispose]: cleanup };
}

function fakeDate(): Disposable {
	vi.useFakeTimers({ toFake: ["Date"] });
	return {
		[Symbol.dispose]() {
			vi.useRealTimers();
		},
	};
}

function selectVariant(label: string) {
	return click(screen.getByRole("radio", { name: label }));
}

async function openPost(title: string) {
	await click(await screen.findByRole("link", { name: title }));
}

function comments() {
	return within(screen.getByRole("region", { name: "Comments" }));
}

describe("prefetch, ensure or fetch", () => {
	it("prefetch opens the post at once, with skeletons", async () => {
		using _demo = await renderDemo();

		await openPost("Render-as-you-fetch, explained");

		expect(
			screen.queryByRole("link", { name: "Render-as-you-fetch, explained" }),
		).toBeNull();
		expect(comments().queryAllByRole("listitem")).toHaveLength(0);
		expect(requestsOf("prefetch")).toEqual([
			"GET /posts success",
			"GET /posts/1/comments pending",
			"GET /posts/1 pending",
		]);

		await screen.findByRole("heading", {
			name: "Render-as-you-fetch, explained",
		});
		expect(await comments().findAllByRole("listitem")).toHaveLength(3);
	});

	it("ensure stays on the list until the post and its comments load", async () => {
		using _demo = await renderDemo();
		await selectVariant("ensure");

		await openPost("Why loaders beat effects");

		expect(
			screen.getByRole("link", { name: "Why loaders beat effects" }),
		).toBeTruthy();
		expect(screen.queryByRole("status", { name: "Loading page" })).toBeNull();
		expect(requestsOf("ensure")).toEqual([
			"GET /posts success",
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);

		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		expect(comments().getAllByRole("listitem")).toHaveLength(4);
		expect(comments().getByText("Grace")).toBeTruthy();
	});

	it("ensure reopens a stale post at once and refetches in the background", async () => {
		using _demo = await renderDemo();
		await selectVariant("ensure");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		await click(screen.getByRole("link", { name: "← All posts" }));
		using _date = fakeDate();
		vi.setSystemTime(Date.now() + 5000);

		await openPost("Why loaders beat effects");

		expect(
			screen.getByRole("heading", { name: "Why loaders beat effects" }),
		).toBeTruthy();
		expect(requestsOf("ensure").slice(3)).toEqual([
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);
	});

	it("fetch waits for the refetch when reopening a stale post", async () => {
		using _demo = await renderDemo();
		await selectVariant("fetch");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		expect(comments().getAllByRole("listitem")).toHaveLength(4);
		await click(screen.getByRole("link", { name: "← All posts" }));
		using _date = fakeDate();
		vi.setSystemTime(Date.now() + 5000);

		await openPost("Why loaders beat effects");

		expect(
			screen.queryByRole("heading", { name: "Why loaders beat effects" }),
		).toBeNull();
		expect(requestsOf("fetch").slice(3)).toEqual([
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
	});

	it("keeps each variant's page and requests while another is shown", async () => {
		using _demo = await renderDemo();
		await openPost("Render-as-you-fetch, explained");
		await screen.findByRole("heading", {
			name: "Render-as-you-fetch, explained",
		});

		await selectVariant("ensure");

		expect(
			await screen.findByRole("link", {
				name: "Render-as-you-fetch, explained",
			}),
		).toBeTruthy();
		expect(requestsOf("ensure")).toEqual(["GET /posts success"]);

		await selectVariant("prefetch");

		expect(
			screen.getByRole("heading", { name: "Render-as-you-fetch, explained" }),
		).toBeTruthy();
		expect(
			within(screen.getByRole("list", { name: "Requests" })).getAllByRole(
				"listitem",
			),
		).toHaveLength(3);
		expect(requestsOf("prefetch")).toEqual([
			"GET /posts success",
			"GET /posts/1/comments success",
			"GET /posts/1 success",
		]);
	});

	it("Reload starts its own variant over on the same URL", async () => {
		using _demo = await renderDemo();
		await openPost("Render-as-you-fetch, explained");
		await screen.findByRole("heading", {
			name: "Render-as-you-fetch, explained",
		});
		await selectVariant("ensure");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });

		await click(screen.getByRole("button", { name: "Reload" }));

		expect(screen.getByText("/posts/2")).toBeTruthy();
		expect(requestsOf("ensure")).toEqual([
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		expect(comments().getAllByRole("listitem")).toHaveLength(4);

		await selectVariant("prefetch");

		expect(
			screen.getByRole("heading", { name: "Render-as-you-fetch, explained" }),
		).toBeTruthy();
		expect(requestsOf("prefetch")).toEqual([
			"GET /posts success",
			"GET /posts/1/comments success",
			"GET /posts/1 success",
		]);
	});

	it("Reload on the list loads it again, with a skeleton", async () => {
		using _demo = await renderDemo();
		await selectVariant("ensure");
		await screen.findByRole("link", { name: "Why loaders beat effects" });

		await click(screen.getByRole("button", { name: "Reload" }));

		expect(screen.getByRole("status", { name: "Loading page" })).toBeTruthy();
		expect(
			screen.queryByRole("link", { name: "Why loaders beat effects" }),
		).toBeNull();
		expect(requestsOf("ensure")).toEqual(["GET /posts pending"]);
		await screen.findByRole("link", { name: "Why loaders beat effects" });
		expect(requestsOf("ensure")).toEqual(["GET /posts success"]);
		expect(screen.queryByRole("status", { name: "Loading page" })).toBeNull();
	});

	it("leaves the page's scroll alone", async () => {
		using _demo = await renderDemo();
		using scrollTo = vi.spyOn(window, "scrollTo");

		await selectVariant("ensure");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		await click(screen.getByRole("link", { name: "← All posts" }));
		await click(screen.getByRole("button", { name: "Reload" }));
		await selectVariant("fetch");

		expect(scrollTo).not.toHaveBeenCalled();
	});

	it("Reset starts every variant over and keeps the selection", async () => {
		using _demo = await renderDemo();
		await openPost("Render-as-you-fetch, explained");
		await selectVariant("ensure");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });

		await click(screen.getByRole("button", { name: "Reset" }));

		expect(
			screen.getByRole<HTMLInputElement>("radio", { name: "ensure" }).checked,
		).toBe(true);
		expect(requestsOf("ensure")).toEqual(["GET /posts pending"]);
		expect(requestsOf("prefetch")).toEqual([]);
		expect(
			await screen.findByRole("link", { name: "Why loaders beat effects" }),
		).toBeTruthy();

		await selectVariant("prefetch");

		expect(
			await screen.findByRole("link", {
				name: "Render-as-you-fetch, explained",
			}),
		).toBeTruthy();
	});

	it("selects the server's latency in every toolbar", async () => {
		using _demo = await renderDemo(createFakeServer(() => ({})).latency);

		expect(
			screen.getByRole("radio", { name: "3G" }).getAttribute("aria-checked"),
		).toBe("true");

		await click(screen.getByRole("radio", { name: "Slow" }));
		await click(screen.getByRole("button", { name: "Expand" }));

		expect(
			within(screen.getByRole("dialog"))
				.getByRole("radio", { name: "Slow" })
				.getAttribute("aria-checked"),
		).toBe("true");
		expect(serverOf("fetch").latency).toBe(2500);
	});
});
