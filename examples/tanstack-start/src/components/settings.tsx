import { LATENCY_COOKIE, latencyOptions } from "@examples/db/types";
import {
	NativeSelect,
	NativeSelectOption,
} from "@examples/ui/components/native-select";
import { useState } from "react";

import {
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
	const [latency, setLatency] = useState<number>(readLatency);

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
						setLatency(Number(event.target.value));
					}}
					size="sm"
					value={latency}
				>
					{latencyOptions.map((option) => (
						<NativeSelectOption key={option.ms} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
		</div>
	);
}
