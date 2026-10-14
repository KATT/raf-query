/** Three requests starting together: render-as-you-fetch's parallel loads. */
export function LogoMark(props: { readonly className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={props.className}
			fill="none"
			viewBox="0 0 32 32"
		>
			<rect className="fill-foreground" height="32" rx="8" width="32" />
			<rect
				className="fill-background"
				height="4"
				rx="2"
				width="18"
				x="7"
				y="8"
			/>
			<rect
				className="fill-background opacity-75"
				height="4"
				rx="2"
				width="12"
				x="7"
				y="14"
			/>
			<rect
				className="fill-background opacity-50"
				height="4"
				rx="2"
				width="15"
				x="7"
				y="20"
			/>
		</svg>
	);
}
