import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readLocalStack } from "./local-stack";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing — global setup did not run`);
  return value;
}

async function signIn(page: Page, email: string, password: string, path = "/admin/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Latest email sent to `to` by the local stack's Mailpit catcher. */
async function latestEmailHtml(to: string): Promise<string> {
  const mailpit = env("E2E_MAILPIT_URL");
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const body = (await search.json()) as { messages?: Array<{ ID: string }> };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${mailpit}/api/v1/message/${id}`)).json()) as {
        HTML: string;
      };
      return message.HTML;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email for ${to}`);
}

test.describe("admin route protection", () => {
  test("unauthenticated visitors are redirected to sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("the set-password page requires a session", async ({ page }) => {
    await page.goto("/admin/update-password");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("admin responses are private and not indexable", async ({ request }) => {
    const response = await request.get("/admin/login");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("invalid email links are rejected", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=bogus&type=recovery&next=/admin");
    await expect(page).toHaveURL(/\/admin\/login\?error=link-invalid/);
    await page.goto("/auth/confirm?token_hash=bogus&type=signup&next=/admin");
    await expect(page).toHaveURL(/\/admin\/login\?error=link-invalid/);
  });
});

test.describe("sign in", () => {
  test("wrong password shows a generic error", async ({ page }) => {
    await signIn(page, env("E2E_ADMIN_EMAIL"), "definitely-wrong-password-1");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Email or password is incorrect.",
    );
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("an unknown account gets the same generic error", async ({ page }) => {
    await signIn(page, "nobody@test.local", "whatever-password-1");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Email or password is incorrect.",
    );
  });

  test("a valid non-admin account is refused and not left signed in", async ({ page }) => {
    await signIn(page, env("E2E_USER_EMAIL"), env("E2E_USER_PASSWORD"));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "This account doesn't have access to the admin area.",
    );
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("an admin can sign in, stay signed in, and sign out", async ({ page }) => {
    await signIn(page, env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"));
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await expect(page.getByText(env("E2E_ADMIN_EMAIL")).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

    const cookies = await page.context().cookies();
    const authCookies = cookies.filter((cookie) => cookie.name.startsWith("sb-"));
    expect(authCookies.length).toBeGreaterThan(0);
    for (const cookie of authCookies) expect(cookie.sameSite).toBe("Lax");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login\?signed-out=1/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("post-login redirects cannot leave the admin area", async ({ page }) => {
    await signIn(
      page,
      env("E2E_ADMIN_EMAIL"),
      env("E2E_ADMIN_PASSWORD"),
      "/admin/login?next=https://evil.example/",
    );
    await expect(page).toHaveURL("http://localhost:3000/admin");
  });
});

test.describe("registration", () => {
  test("public sign-up is disabled", async () => {
    const { apiUrl, publishableKey } = readLocalStack();
    const client = createClient(apiUrl, publishableKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signUp({
      email: `signup-${Date.now()}@test.local`,
      password: "attemptedSignup2026",
    });
    expect(data.user).toBeNull();
    expect(error?.code).toBe("signup_disabled");
  });
});

test.describe("password reset", () => {
  test("reset email → set new password → sign in with it", async ({ page }) => {
    const email = env("E2E_ADMIN_EMAIL");
    const newPassword = `${env("E2E_ADMIN_PASSWORD")}x1`;

    await page.goto("/admin/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "If an admin account exists",
    );

    const html = await latestEmailHtml(email);
    const link = html.match(/href="([^"]*\/auth\/confirm\?[^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(link, "reset link in email").toBeTruthy();
    expect(link).toContain("type=recovery");
    expect(link!.startsWith("http://localhost:3000/auth/confirm?")).toBe(true);

    await page.goto(link!);
    await expect(page).toHaveURL(/\/admin\/update-password$/);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/admin\?password-updated=1/);
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "Your password has been updated.",
    );

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login\?signed-out=1/);
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL(/\/admin$/);

    // The one-time link cannot be reused.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login\?signed-out=1/);
    await page.goto(link!);
    await expect(page).toHaveURL(/\/admin\/login\?error=link-invalid/);
  });

  test("the reset link points back to the origin that requested it", async ({ page }) => {
    // Same server, reached through a different origin than the project's Site URL
    // (http://localhost:3000) — like a Vercel Preview sharing the staging project.
    const requestingOrigin = "http://127.0.0.1:3000";
    const email = env("E2E_USER_EMAIL");

    await page.goto(`${requestingOrigin}/admin/forgot-password`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "If an admin account exists",
    );

    const html = await latestEmailHtml(email);
    const link = html.match(/href="([^"]*\/auth\/confirm\?[^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(link, "reset link in email").toBeTruthy();
    const url = new URL(link!);
    expect(url.origin).toBe(requestingOrigin);
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("next")).toBe("/admin/update-password");

    // Following it on that origin creates a session there and reaches the set-password page.
    await page.goto(link!);
    await expect(page).toHaveURL(`${requestingOrigin}/admin/update-password`);
  });

  test("the reset form does not reveal whether an account exists", async ({ page }) => {
    await page.goto("/admin/forgot-password");
    await page.getByLabel("Email").fill("nobody@test.local");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "If an admin account exists",
    );
  });
});
