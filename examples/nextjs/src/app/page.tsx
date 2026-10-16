import { DEFAULT_LOADER_VERB } from "@examples/db/types";
import { redirect } from "next/navigation";

export default function Home() {
	redirect(`/${DEFAULT_LOADER_VERB}/issues`);
}
