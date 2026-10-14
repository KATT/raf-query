/** Whether this browser is subscribed to `channel`'s push notifications. */
export async function detectPushState(channel: string): Promise<"on" | "off"> {
	const registration = await navigator.serviceWorker.getRegistration(
		`/push/${channel}/`,
	);
	const subscription = await registration?.pushManager.getSubscription();
	return subscription ? "on" : "off";
}
