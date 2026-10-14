import { Button } from "@examples/ui/components/button";
import { Moon, Sun } from "lucide-react";

const storageKey = "raf-query-docs:theme";

/** Runs before first paint, so a dark page never flashes light. */
export const themeScript = `(() => {
	try {
		const stored = localStorage.getItem(${JSON.stringify(storageKey)});
		const dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
		document.documentElement.classList.toggle("dark", dark);
	} catch {}
})();`;

export function ThemeToggle() {
	return (
		<Button
			aria-label="Toggle dark mode"
			onClick={() => {
				const dark = document.documentElement.classList.toggle("dark");
				localStorage.setItem(storageKey, dark ? "dark" : "light");
			}}
			size="icon-sm"
			variant="ghost"
		>
			<Sun className="hidden dark:block" />
			<Moon className="dark:hidden" />
		</Button>
	);
}
