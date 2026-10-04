import { execSync } from "node:child_process";

/**
 * Connection details for the LOCAL Supabase test stack (`supabase start`), read at run time
 * from the CLI. These are the stack's well-known local demo keys, never hosted credentials,
 * and they are never written to disk or committed. E2E tests refuse to run against anything
 * other than 127.0.0.1.
 */
export type LocalStack = {
  apiUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  mailpitUrl: string;
};

export function readLocalStack(): LocalStack {
  const raw = execSync("npx supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const env = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );

  const apiUrl = env.API_URL;
  const publishableKey = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
  const serviceRoleKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
  const mailpitUrl = env.MAILPIT_URL ?? env.INBUCKET_URL ?? "http://127.0.0.1:54324";

  if (!apiUrl || !publishableKey || !serviceRoleKey) {
    throw new Error("Local Supabase stack is not running. Start it with `npm run db:start`.");
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(apiUrl)) {
    throw new Error(`Refusing to run E2E tests against a non-local Supabase (${apiUrl}).`);
  }
  return { apiUrl, publishableKey, serviceRoleKey, mailpitUrl };
}
