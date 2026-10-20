import { afterAll } from "vitest";
import { closeAllTestDatabases } from "./db-test-helper";

afterAll(async () => {
  await closeAllTestDatabases();
});
