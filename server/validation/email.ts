import * as z from "zod";

/**
 * The email field used by every form in the app.
 *
 * The order matters: the value is TRIMMED and lower-cased FIRST, and
 * only then checked against the email format.
 *
 * `z.email().trim()` looks equivalent but is not — in Zod, the format
 * check runs at the point it is declared, so `z.email()` would reject
 * `" jordan@example.com "` (the spaces are still there when the format
 * is checked) and the `.trim()` after it would never get a chance to
 * run. Trimming first and piping into the format check gets both
 * behaviours: surrounding whitespace is accepted and normalised away,
 * and anything that is not an email is still rejected.
 */
export function emailSchema(): z.ZodPipe<z.ZodString, z.ZodEmail> {
  return z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address."));
}
