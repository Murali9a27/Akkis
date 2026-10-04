import type { ReactNode } from "react";
import styles from "./forms.module.css";

export function AuthNotice({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`${tone === "error" ? styles.alert : styles.notice} ${styles.spaced}`}
    >
      {children}
    </p>
  );
}
