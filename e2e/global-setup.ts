import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalStack } from "./local-stack";

/** Random password satisfying the auth policy (12+ chars, letters and digits). */
function generatePassword(): string {
  return `${randomBytes(12).toString("hex")}Ab9`;
}

/**
 * Creates fresh test users on the LOCAL stack for this run: one admin, one ordinary user.
 * Credentials are generated per run and handed to the tests via process.env only.
 */
export default async function globalSetup(): Promise<void> {
  const stack = readLocalStack();
  const admin = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = randomBytes(4).toString("hex");
  const users = {
    admin: { email: `e2e-admin-${runId}@test.local`, password: generatePassword() },
    user: { email: `e2e-user-${runId}@test.local`, password: generatePassword() },
  };

  for (const [kind, credentials] of Object.entries(users)) {
    const { data, error } = await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`Could not create ${kind} test user: ${error?.message}`);
    if (kind === "admin") {
      const { error: grantError } = await admin
        .from("admin_users")
        .insert({ user_id: data.user.id });
      if (grantError) throw new Error(`Could not grant admin: ${grantError.message}`);
    }
  }

  process.env.E2E_ADMIN_EMAIL = users.admin.email;
  process.env.E2E_ADMIN_PASSWORD = users.admin.password;
  process.env.E2E_USER_EMAIL = users.user.email;
  process.env.E2E_USER_PASSWORD = users.user.password;
  process.env.E2E_MAILPIT_URL = stack.mailpitUrl;
}
