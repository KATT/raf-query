import { DEFAULT_LOADER_VERB } from "@examples/db/types";
import { redirect } from "react-router";

export function loader() {
	return redirect(`/${DEFAULT_LOADER_VERB}/issues`);
}
