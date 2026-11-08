// @vitest-environment happy-dom
import { expect, it, vi } from "@effect/vitest";

import {
	closeDelay,
	installTwoslashHovers,
	openDelay,
	switchDelay,
} from "./twoslash-hovers.ts";

/** Two names on a line, as Twoslash renders them, and a plain token. */
const block = `
<pre class="twoslash"><code><span class="line"><span class="twoslash-hover" id="router"><span class="twoslash-popup-container" id="router-popup"><code class="twoslash-popup-code">const router: Router</code></span>router</span><span id="plain"> = </span><span class="twoslash-hover" id="t"><span class="twoslash-popup-container"><code class="twoslash-popup-code">const t: TRPC</code></span>t</span></span></code></pre>
<p id="outside">After the block</p>
`;

/**
 * A test body run in a page with {@link block}, its hovers installed, and
 * fake timers. `body` gets the hovers' cleanup, which also runs after it.
 */
function withHovers(body: (cleanup: () => void) => void) {
	return () => {
		vi.useFakeTimers();
		document.body.innerHTML = `<div id="root">${block}</div><p id="page">Page</p>`;
		const cleanup = installTwoslashHovers(element("root"));
		try {
			body(cleanup);
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	};
}

function element(id: string) {
	const found = document.getElementById(id);
	if (!found) {
		throw new Error(`#${id} isn't in the page`);
	}
	return found;
}

/** Moves the pointer from `from` (or nowhere) onto `to`, as a browser reports it. */
function move(from: string | null, to: string) {
	const left = from === null ? null : element(from);
	const entered = element(to);
	left?.dispatchEvent(
		new MouseEvent("pointerout", { bubbles: true, relatedTarget: entered }),
	);
	entered.dispatchEvent(
		new MouseEvent("pointerover", { bubbles: true, relatedTarget: left }),
	);
}

function openName() {
	return document.querySelector("[data-open]")?.id ?? null;
}

it(
	"a popup opens once the pointer rests on its name",
	withHovers(() => {
		move(null, "router");
		vi.advanceTimersByTime(openDelay - 1);
		expect(openName()).toBe(null);
		vi.advanceTimersByTime(1);
		expect(openName()).toBe("router");
	}),
);

it(
	"sweeping across a name opens nothing",
	withHovers(() => {
		move(null, "router");
		vi.advanceTimersByTime(openDelay / 2);
		move("router", "outside");
		vi.advanceTimersByTime(openDelay * 2);
		expect(openName()).toBe(null);
	}),
);

it(
	"a popup stays open while the pointer moves into it",
	withHovers(() => {
		move(null, "router");
		vi.advanceTimersByTime(openDelay);
		// Across the gap between the name and its popup, which isn't the name.
		move("router", "plain");
		vi.advanceTimersByTime(closeDelay - 1);
		move("plain", "router-popup");
		vi.advanceTimersByTime(closeDelay * 2);
		expect(openName()).toBe("router");
	}),
);

it(
	"crossing another name on the way into a popup keeps the popup",
	withHovers(() => {
		move(null, "router");
		vi.advanceTimersByTime(openDelay);
		move("router", "t");
		vi.advanceTimersByTime(switchDelay - 1);
		move("t", "router-popup");
		vi.advanceTimersByTime(closeDelay * 2);
		expect(openName()).toBe("router");
	}),
);

it(
	"a popup closes a moment after the pointer leaves it",
	withHovers(() => {
		move(null, "router");
		vi.advanceTimersByTime(openDelay);
		move("router", "outside");
		vi.advanceTimersByTime(closeDelay - 1);
		expect(openName()).toBe("router");
		vi.advanceTimersByTime(1);
		expect(openName()).toBe(null);
	}),
);

it(
	"resting on another name switches to its popup sooner",
	withHovers(() => {
		move(null, "router");
		vi.advanceTimersByTime(openDelay);
		move("router", "t");
		vi.advanceTimersByTime(switchDelay);
		expect(openName()).toBe("t");
	}),
);

it(
	"a click pins a popup until Escape",
	withHovers(() => {
		element("router").click();
		expect(openName()).toBe("router");
		expect(element("router").hasAttribute("data-pinned")).toBe(true);
		move("router", "outside");
		vi.advanceTimersByTime(closeDelay * 2);
		expect(openName()).toBe("router");
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(openName()).toBe(null);
	}),
);

it(
	"a pinned popup closes on a click elsewhere, or on its name",
	withHovers(() => {
		element("router").click();
		element("page").click();
		expect(openName()).toBe(null);
		element("router").click();
		element("router").click();
		expect(openName()).toBe(null);
	}),
);

it(
	"a click inside a popup keeps it open",
	withHovers(() => {
		element("router").click();
		element("router-popup").click();
		expect(openName()).toBe("router");
	}),
);

it(
	"scrolling inside a popup doesn't place it again",
	withHovers(() => {
		element("router").click();
		const popup = element("router-popup");
		// Placing a popup clears its max height to measure it, which scrolls a
		// long type back to its top.
		popup.style.maxHeight = "123px";
		popup.dispatchEvent(new Event("scroll"));
		expect(popup.style.maxHeight).toBe("123px");
		document.dispatchEvent(new Event("scroll"));
		expect(popup.style.maxHeight).not.toBe("123px");
	}),
);

it(
	"cleanup closes the popup and stops listening",
	withHovers((cleanup) => {
		element("router").click();
		cleanup();
		expect(openName()).toBe(null);
		expect(element("root").hasAttribute("data-twoslash-hovers")).toBe(false);
		element("t").click();
		expect(openName()).toBe(null);
	}),
);
