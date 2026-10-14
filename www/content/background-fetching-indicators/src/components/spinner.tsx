export function Spinner(props: { readonly label: string }) {
	return <span aria-label={props.label} className="spinner" role="status" />;
}
