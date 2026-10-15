import {
	applyStaleTime,
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	latencyOptions,
	parseLatency,
	parseStaleTime,
	type QueryTimeDefaults,
	STALE_TIME_COOKIE,
	staleTimeOptions,
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
	readStaleTime,
	writeCookie,
} from "~/settings.ts";

/** Settings for trying the app under different conditions. */
export function Settings(props: {
	readonly onPrefetchChange: (prefetch: Prefetch) => void;
	readonly onReset: () => void;
	readonly prefetch: Prefetch;
	readonly queryDefaults: QueryTimeDefaults;
}) {
	const [latency, setLatency] = useState(readLatency);
	const [staleTime, setStaleTime] = useState(readStaleTime);

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground whitespace-nowrap">
					Prefetch links
				</span>
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
				<span className="text-muted-foreground whitespace-nowrap">
					Stale time
				</span>
				<NativeSelect
					onChange={(event) => {
						const next = parseStaleTime(event.target.value);
						if (next === undefined) {
							return;
						}
						writeCookie(STALE_TIME_COOKIE, event.target.value);
						applyStaleTime(props.queryDefaults, next);
						setStaleTime(next);
					}}
					size="sm"
					value={staleTime ?? DEFAULT_STALE_TIME}
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
				onClick={() => {
					clearCookie(PREFETCH_COOKIE);
					clearCookie(LATENCY_COOKIE);
					clearCookie(STALE_TIME_COOKIE);
					applyStaleTime(props.queryDefaults, DEFAULT_STALE_TIME);
					setLatency(undefined);
					setStaleTime(undefined);
					props.onPrefetchChange(DEFAULT_PREFETCH);
					props.onReset();
				}}
				size="sm"
				variant="ghost"
			>
				Reset
			</Button>
		</div>
	);
}
