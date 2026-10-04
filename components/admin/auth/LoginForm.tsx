"use client";

import { useActionState } from "react";
import { initialFormState } from "@/lib/forms";
import { signIn } from "@/server/actions/auth";
import { AuthField } from "./AuthField";
import { FormMessage } from "./FormMessage";
import styles from "./forms.module.css";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className={styles.form} noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <AuthField
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        required
        errors={fieldErrors?.email}
      />
      <AuthField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors?.password}
      />
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
