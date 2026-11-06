import { createQueryClient } from "@raf-query/react";
import { cache } from "react";

export const getQueryClient = cache(() =>
	createQueryClient({ staleTime: 5000 }),
);
