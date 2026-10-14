export function PushSwitch(props: {
	readonly state: "on" | "off" | "unknown";
}) {
	return (
		<label>
			<input
				checked={props.state === "on"}
				disabled={props.state === "unknown"}
				readOnly
				type="checkbox"
			/>
			Push notifications
		</label>
	);
}
