/**
 * Supabase project refs per environment. Project refs are public identifiers (they appear
 * in every API URL), so they are committed here rather than configured per deployment:
 * a mis-set Vercel variable must never be able to point Preview at production.
 *
 * Fill these in once the projects exist (Supabase dashboard → Project Settings → General).
 * While a ref is `null`, every Vercel deployment refuses to start (fail closed); only the
 * local test stack can be used.
 */
export const SUPABASE_PROJECT_REFS: Readonly<{
  staging: string | null;
  production: string | null;
}> = {
  staging: null,
  production: null,
};
