import { cn } from "#lib/utils.ts";

// Rows and their skeletons share one fixed height, so a loaded page takes
// exactly the space its skeletons held and nothing below it moves.
export const rowClassName = "flex h-12 items-center gap-3 px-4";

/** The class for the link each issue row renders in. */
export const issueRowClassName = cn(rowClassName, "group hover:bg-muted/50");
