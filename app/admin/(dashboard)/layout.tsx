import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/admin";
import { signOut } from "@/server/actions/auth";
import styles from "./dashboard.module.css";

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireAdmin();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.brand}>Akki&apos;s Healthy Baking · Admin</p>
        <div className={styles.account}>
          <span>{session.email}</span>
          <form action={signOut}>
            <button type="submit" className={styles.signOut}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
