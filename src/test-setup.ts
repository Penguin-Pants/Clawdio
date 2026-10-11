import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components after each test, so queries see one test's DOM only.
afterEach(cleanup);
