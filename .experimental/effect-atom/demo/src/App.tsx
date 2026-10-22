import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@examples/ui/components/tabs";

import { Playground } from "./live.tsx";
import { TypeErrors } from "./type-errors.tsx";

export const Demo = () => (
	<div className="mx-auto max-w-7xl space-y-6 p-6">
		<header className="space-y-1">
			<h1 className="text-2xl font-semibold">
				effect-atom: typed error boundaries over atoms
			</h1>
			<p className="max-w-3xl text-sm text-muted-foreground">
				Each boundary catches some of the errors an Effect RPC atom can fail
				with, and takes them off the type of every hook read through it. A
				failure goes to the innermost boundary that catches it; what no boundary
				catches comes back to the component, which the compiler makes handle it.
			</p>
		</header>
		<Tabs defaultValue="live">
			<TabsList>
				<TabsTrigger value="live">Live</TabsTrigger>
				<TabsTrigger value="types">Type errors</TabsTrigger>
			</TabsList>
			<TabsContent className="pt-3" value="live">
				<Playground />
			</TabsContent>
			<TabsContent className="pt-3" value="types">
				<TypeErrors />
			</TabsContent>
		</Tabs>
	</div>
);
