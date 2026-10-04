"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/forms";
import { requestPasswordReset } from "@/server/actions/auth";
import { AuthField } from "./AuthField";
import { FormMessage } from "./FormMessage";
import styles from "./forms.module.css";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className={styles.form} noValidate>
      <FormMessage state={state} />
      <AuthField
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        required
        errors={fieldErrors?.email}
      />
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
