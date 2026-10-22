/** The outlines that show which boundary wraps what, and which one caught. */
import { cn } from "@examples/ui/lib/utils";
import type { ReactNode } from "react";

export type Tone = "root" | "network" | "session" | "access" | "inline";

const tones = {
	access: "border-sky-500/50 text-sky-700 dark:text-sky-300",
	inline: "border-emerald-500/60 text-emerald-700 dark:text-emerald-300",
	network: "border-amber-500/50 text-amber-700 dark:text-amber-300",
	root: "border-zinc-400/60 text-zinc-600 dark:text-zinc-300",
	session: "border-violet-500/50 text-violet-700 dark:text-violet-300",
} satisfies Record<Tone, string>;

/** A boundary's outline while its children render. */
export const Frame = (props: {
	readonly catches: string;
	readonly children: ReactNode;
	readonly className?: string;
	readonly name: string;
	readonly tone: Tone;
}) => (
	<section
		className={cn(
			"relative rounded-xl border-2 border-dashed px-3 pt-6 pb-3",
			tones[props.tone],
			props.className,
		)}
	>
		<span className="absolute top-1.5 left-3 font-mono text-[11px] leading-none">
			<strong>{props.name}</strong> catches {props.catches}
		</span>
		<div className="text-foreground">{props.children}</div>
	</section>
);

/** A fallback: the boundary's outline turns solid, and says what it caught. */
export const Caught = (props: {
	readonly actions?: ReactNode;
	readonly children: ReactNode;
	readonly name: string;
	readonly tone: Tone;
	readonly what: string;
}) => (
	<section
		className={cn(
			"relative rounded-xl border-2 bg-destructive/5 px-4 pt-7 pb-4",
			tones[props.tone],
		)}
		role="alert"
	>
		<span className="absolute top-2 left-4 font-mono text-[11px] leading-none">
			<strong>{props.name}</strong> caught <strong>{props.what}</strong>
		</span>
		<div className="space-y-3 text-foreground">
			{props.children}
			{props.actions === undefined ? null : (
				<div className="flex gap-2">{props.actions}</div>
			)}
		</div>
	</section>
);
