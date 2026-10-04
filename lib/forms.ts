/** Result shape returned by form Server Actions and consumed with useActionState. */
export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<string, string[]>> };

export const initialFormState: FormState = { status: "idle" };
