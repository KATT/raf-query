import { Button } from "@examples/ui/components/button";

/**
 * Infinite scroll: a "Load more" button that also presses itself when it
 * scrolls into view. It watches again after each load, so it keeps loading
 * while it stays visible.
 */
export function LoadMore(props: {
	readonly loading: boolean;
	readonly onLoad: () => void;
}) {
	return (
		<Button
			disabled={props.loading}
			onClick={props.onLoad}
			ref={(button) => {
				if (button === null || props.loading) {
					return;
				}
				const observer = new IntersectionObserver((entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						observer.disconnect();
						props.onLoad();
					}
				});
				observer.observe(button);
				return () => {
					observer.disconnect();
				};
			}}
			variant="outline"
		>
			{props.loading ? "Loading…" : "Load more"}
		</Button>
	);
}
