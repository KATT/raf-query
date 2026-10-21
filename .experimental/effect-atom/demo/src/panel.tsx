import { useAtomSet } from "@effect/atom-react";
import { Label } from "@examples/ui/components/label";
import { Slider } from "@examples/ui/components/slider";
import { Switch } from "@examples/ui/components/switch";
import { cn } from "cn";
import type { ReactNode } from "react";

import { invalidateDocsAtom } from "./atoms.ts";
import { type Chaos, setChaos, toggle, useChaos } from "./chaos.ts";
import { useEvents } from "./log.ts";

/** Changes the server, then refreshes the atoms keyed `"docs"`, so the change shows. */
const useChange = () => {
	const invalidate = useAtomSet(invalidateDocsAtom);
	return (patch: Partial<Chaos>) => {
		setChaos(patch);
		invalidate();
	};
};

const Toggle = (props: {
	readonly checked: boolean;
	readonly children: ReactNode;
	readonly hint: string;
	readonly onChange: (checked: boolean) => void;
}) => (
	<Label className="flex items-start justify-between gap-3">
		<span className="space-y-0.5">
			<span className="block text-sm font-medium">{props.children}</span>
			<span className="block text-xs font-normal text-muted-foreground">
				{props.hint}
			</span>
		</span>
		<Switch checked={props.checked} onCheckedChange={props.onChange} />
	</Label>
);

const docs = [
	{ id: 1, title: "Design notes" },
	{ id: 2, title: "Routing" },
	{ id: 3, title: "Salaries" },
	{ id: 4, title: "Defects" },
];

export const ChaosPanel = () => {
	const chaos = useChaos();
	const change = useChange();
	return (
		<section className="space-y-4">
			<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
				Chaos
			</h2>
			<Toggle
				checked={!chaos.signedIn}
				hint="Session middleware fails: Unauthorized"
				onChange={(checked) => change({ signedIn: !checked })}
			>
				Sign out
			</Toggle>
			<Toggle
				checked={chaos.offline}
				hint="Transport fails: RpcClientError"
				onChange={(checked) => change({ offline: checked })}
			>
				Go offline
			</Toggle>
			<Toggle
				checked={chaos.serverBug}
				hint="GetDoc dies: a defect"
				onChange={(checked) => change({ serverBug: checked })}
			>
				Server bug
			</Toggle>
			<div className="space-y-1.5">
				<span className="block text-sm font-medium">Per doc</span>
				<table className="w-full text-xs">
					<thead className="text-muted-foreground">
						<tr>
							<th className="text-left font-normal">Doc</th>
							<th className="font-normal">No access</th>
							<th className="font-normal">Deleted</th>
						</tr>
					</thead>
					<tbody>
						{docs.map((doc) => (
							<tr key={doc.id}>
								<td className="py-1">{doc.title}</td>
								<td className="text-center">
									<Switch
										aria-label={`No access to ${doc.title}`}
										checked={chaos.locked.has(doc.id)}
										onCheckedChange={() =>
											change({ locked: toggle(chaos.locked, doc.id) })
										}
										size="sm"
									/>
								</td>
								<td className="text-center">
									<Switch
										aria-label={`Delete ${doc.title}`}
										checked={chaos.deleted.has(doc.id)}
										onCheckedChange={() =>
											change({ deleted: toggle(chaos.deleted, doc.id) })
										}
										size="sm"
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="space-y-2">
				<span className="flex justify-between text-sm font-medium">
					Latency{" "}
					<span className="font-normal text-muted-foreground">
						{chaos.latency} ms
					</span>
				</span>
				<Slider
					max={2000}
					min={0}
					onValueChange={(value) =>
						setChaos({ latency: Array.isArray(value) ? value[0] : value })
					}
					step={50}
					value={chaos.latency}
				/>
			</div>
		</section>
	);
};

export const EventLog = () => {
	const events = useEvents();
	return (
		<section className="space-y-2">
			<h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
				Where failures went
			</h2>
			<p className="text-xs text-muted-foreground">
				From the root boundary&rsquo;s <code>onCaught</code>. Failures no
				boundary catches stay in the component that read them.
			</p>
			{events.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Nothing caught yet. Flip a switch.
				</p>
			) : (
				<ol className="space-y-1 text-xs">
					{events.map((event) => (
						<li className="flex items-baseline gap-2" key={event.id}>
							<span
								className={cn(
									"rounded px-1.5 py-0.5 font-mono",
									event.root
										? "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
										: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
								)}
							>
								{event.by}
							</span>
							<span>{event.what}</span>
						</li>
					))}
				</ol>
			)}
		</section>
	);
};
