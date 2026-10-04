import type { FormState } from "@/lib/forms";
import styles from "./forms.module.css";

/** Announces the form-level result to assistive technology. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? styles.alert : styles.notice}
    >
      {state.message}
    </p>
  );
}
