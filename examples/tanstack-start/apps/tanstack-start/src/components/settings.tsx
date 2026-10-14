import {
	DEFAULT_LATENCY_MS,
	LATENCY_COOKIE,
	latencyOptions,
	parseLatency,
} from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import {
	NativeSelect,
	NativeSelectOption,
} from "@examples/ui/components/native-select";
import { useState } from "react";

import {
	clearCookie,
	DEFAULT_PREFETCH,
	parsePrefetch,
	type Prefetch,
	PREFETCH_COOKIE,
	prefetchOptions,
	readLatency,
	writeCookie,
} from "~/settings.ts";

/** Settings for trying the app under different conditions. */
export function Settings(props: {
	readonly onPrefetchChange: (prefetch: Prefetch) => void;
	readonly prefetch: Prefetch;
}) {
	const [latency, setLatency] = useState(readLatency);
	const changed = latency !== undefined || props.prefetch !== DEFAULT_PREFETCH;

	return (
		<div className="flex items-center gap-4 text-sm">
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground">Prefetch links</span>
				<NativeSelect
					onChange={(event) => {
						const prefetch = parsePrefetch(event.target.value);
						writeCookie(PREFETCH_COOKIE, prefetch);
						props.onPrefetchChange(prefetch);
					}}
					size="sm"
					value={props.prefetch}
				>
					{prefetchOptions.map((option) => (
						<NativeSelectOption key={option.value} value={option.value}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground">Latency</span>
				<NativeSelect
					onChange={(event) => {
						writeCookie(LATENCY_COOKIE, event.target.value);
						setLatency(parseLatency(event.target.value));
					}}
					size="sm"
					value={latency ?? DEFAULT_LATENCY_MS}
				>
					{latencyOptions.map((option) => (
						<NativeSelectOption key={option.ms} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<Button
				disabled={!changed}
				onClick={() => {
					clearCookie(PREFETCH_COOKIE);
					clearCookie(LATENCY_COOKIE);
					setLatency(undefined);
					props.onPrefetchChange(DEFAULT_PREFETCH);
				}}
				size="sm"
				variant="ghost"
			>
				Reset
			</Button>
		</div>
	);
}
