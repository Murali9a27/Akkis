import { defineConfig, devices } from "@playwright/test";
import { readLocalStack } from "./e2e/local-stack";

/**
 * End-to-end tests run against a production build of the app wired to the LOCAL Supabase
 * test stack only. Port 3000 matches site_url in supabase/config.toml, so links in auth
 * emails (read from the local Mailpit inbox) point back at this server.
 */
const stack = readLocalStack();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start -- --port 3000",
    url: "http://localhost:3000/admin/login",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    },
  },
});
