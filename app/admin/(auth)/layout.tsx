import type { ReactNode } from "react";
import styles from "./auth.module.css";

export default function AdminAuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>Akki&apos;s Healthy Baking · Admin</p>
        {children}
      </div>
    </main>
  );
}
