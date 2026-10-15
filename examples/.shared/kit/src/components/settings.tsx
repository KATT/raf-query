"use client";

import { latencyOptions, staleTimeOptions } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import {
	NativeSelect,
	NativeSelectOption,
} from "@examples/ui/components/native-select";

/**
 * The top bar's settings: link prefetching, stale time, latency, and Reset.
 * Each `on…Change` gets the chosen option's value as a string.
 */
export function SettingsControls(props: {
	readonly latency: number;
	readonly onLatencyChange: (value: string) => void;
	readonly onPrefetchChange: (value: string) => void;
	readonly onReset: () => void;
	readonly onStaleTimeChange: (value: string) => void;
	readonly prefetch: string;
	readonly prefetchOptions: ReadonlyArray<{
		readonly label: string;
		readonly value: string;
	}>;
	readonly staleTime: number;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground whitespace-nowrap">
					Prefetch links
				</span>
				<NativeSelect
					onChange={(event) => {
						props.onPrefetchChange(event.target.value);
					}}
					size="sm"
					value={props.prefetch}
				>
					{props.prefetchOptions.map((option) => (
						<NativeSelectOption key={option.value} value={option.value}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground whitespace-nowrap">
					Stale time
				</span>
				<NativeSelect
					onChange={(event) => {
						props.onStaleTimeChange(event.target.value);
					}}
					size="sm"
					value={props.staleTime}
				>
					{staleTimeOptions.map((option) => (
						<NativeSelectOption key={option.label} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground">Latency</span>
				<NativeSelect
					onChange={(event) => {
						props.onLatencyChange(event.target.value);
					}}
					size="sm"
					value={props.latency}
				>
					{latencyOptions.map((option) => (
						<NativeSelectOption key={option.ms} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<Button onClick={props.onReset} size="sm" variant="ghost">
				Reset
			</Button>
		</div>
	);
}
