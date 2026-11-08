import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// oxlint-disable-next-line vitest/no-hooks -- Testing Library unmounts between tests only through a global afterEach
afterEach(cleanup);
