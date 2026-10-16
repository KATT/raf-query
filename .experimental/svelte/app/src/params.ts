import { LoaderVerb } from "@examples/db/types";
import { defineParams } from "@sveltejs/kit/params";

/** `verb`: `/prefetch/…`, `/ensure/…` or `/fetch/…`; any other first segment is a 404. */
export const params = defineParams({ verb: LoaderVerb });
