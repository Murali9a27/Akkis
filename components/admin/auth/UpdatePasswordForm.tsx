"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/forms";
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";
import { updatePassword } from "@/server/actions/auth";
import { AuthField } from "./AuthField";
import { FormMessage } from "./FormMessage";
import styles from "./forms.module.css";

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className={styles.form} noValidate>
      <FormMessage state={state} />
      <AuthField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with at least one letter and one number.`}
        errors={fieldErrors?.password}
      />
      <AuthField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors?.confirmPassword}
      />
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
