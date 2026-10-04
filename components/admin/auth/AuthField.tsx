import type { InputHTMLAttributes } from "react";
import styles from "./forms.module.css";

type AuthFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
};

export function AuthField({ name, label, hint, errors, ...inputProps }: AuthFieldProps) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        name={name}
        className={styles.input}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {errorId ? (
        <p id={errorId} className={styles.fieldError}>
          {errors?.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
