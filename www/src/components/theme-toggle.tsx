import { cn } from "@examples/ui/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

const storageKey = "raf-query-docs:theme";

/**
 * Sets `dark` or `light` on <html> from the stored choice, or from the system
 * setting when there is none. Stringified into `themeScript`, so it can't use
 * anything from its module scope.
 */
function applyTheme(key: string) {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(key);
	} catch {
		// Storage is blocked: follow the system setting.
	}
	const dark =
		stored === "dark" ||
		(stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.classList.toggle("light", !dark);
}

/** Runs before first paint, so a dark page never flashes light. */
export const themeScript = `(${applyTheme.toString()})(${JSON.stringify(storageKey)});`;

const listeners = new Set<() => void>();

function readTheme(): Theme {
	try {
		const stored = localStorage.getItem(storageKey);
		return stored === "dark" || stored === "light" ? stored : "system";
	} catch {
		return "system";
	}
}

function setTheme(theme: Theme) {
	try {
		if (theme === "system") {
			localStorage.removeItem(storageKey);
		} else {
			localStorage.setItem(storageKey, theme);
		}
	} catch {
		// Storage is blocked: the page keeps following the system setting.
	}
	applyTheme(storageKey);
	for (const listener of listeners) {
		listener();
	}
}

/** Follows the system setting, and choices made in other tabs. */
function subscribe(onChange: () => void) {
	const media = matchMedia("(prefers-color-scheme: dark)");
	const update = () => {
		applyTheme(storageKey);
		onChange();
	};
	listeners.add(onChange);
	media.addEventListener("change", update);
	window.addEventListener("storage", update);
	return () => {
		listeners.delete(onChange);
		media.removeEventListener("change", update);
		window.removeEventListener("storage", update);
	};
}

const options = [
	{ Icon: Monitor, label: "System theme", value: "system" },
	{ Icon: Sun, label: "Light theme", value: "light" },
	{ Icon: Moon, label: "Dark theme", value: "dark" },
] as const;

export function ThemeToggle() {
	// The server can't know the stored choice, so nothing is pressed until
	// hydration.
	const theme = useSyncExternalStore(subscribe, readTheme, () => null);
	return (
		<div
			aria-label="Theme"
			className="flex items-center gap-0.5 rounded-full border p-0.5"
			role="group"
		>
			{options.map((option) => (
				<button
					aria-label={option.label}
					aria-pressed={theme === option.value}
					className={cn(
						"flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
						theme === option.value && "bg-muted text-foreground",
					)}
					key={option.value}
					onClick={() => setTheme(option.value)}
					title={option.label}
					type="button"
				>
					<option.Icon aria-hidden className="size-3.5" />
				</button>
			))}
		</div>
	);
}
