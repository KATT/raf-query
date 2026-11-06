import { useQuery } from "@tanstack/react-query";
import { getPost } from "~/api.ts";

// #region screen
export function PostSidebar(props: { slug: string }) {
	const { data } = useQuery({
		queryKey: ["posts", "detail", props.slug],
		queryFn: () => getPost(props.slug),
	});
	return <aside>{data?.title}</aside>;
}
// #endregion
