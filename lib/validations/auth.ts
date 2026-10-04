import { z } from "zod";

/** Keep in sync with supabase/config.toml: minimum_password_length + password_requirements. */
export const PASSWORD_MIN_LENGTH = 12;
/** bcrypt (used by Supabase Auth) only considers the first 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

export const signInSchema = z.object({
  email,
  // Sign-in never reveals password rules; anything non-empty is passed to Supabase.
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password.").max(200),
});

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: z
      .string({ error: "Enter a new password." })
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_LENGTH, {
        message: `Use at most ${PASSWORD_MAX_LENGTH} bytes.`,
      })
      .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
        message: "Include at least one letter and one number.",
      }),
    confirmPassword: z.string({ error: "Confirm your new password." }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The passwords don't match.",
    path: ["confirmPassword"],
  });
