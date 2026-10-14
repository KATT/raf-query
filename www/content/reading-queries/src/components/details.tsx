import { use, useState } from "react";

import { DetailsTable } from "./details-table";

interface Details {
	readonly body: string;
}

// #region details
function Details(props: { details: Promise<Details>; open: boolean }) {
	if (!props.open) return null;
	return <DetailsTable details={use(props.details)} />;
}
// #endregion

export function DetailsToggle(props: { details: Promise<Details> }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button onClick={() => setOpen(!open)}>Details</button>
			<Details details={props.details} open={open} />
		</>
	);
}
