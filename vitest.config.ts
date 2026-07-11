import { defineConfig } from "vitest/config";
import { config } from "dotenv";

const { parsed } = config({ path: ".env.test" });

export default defineConfig({
  test: {
    env: parsed,
    fileParallelism: false,
  },
});
