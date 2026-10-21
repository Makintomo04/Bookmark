import { z } from "zod";

export const PASSWORD_MIN = 8;
// bcrypt only hashes the first 72 bytes, so longer passwords give a false sense of strength.
export const PASSWORD_MAX = 72;

// Not lowercased: sign-in looks emails up exactly as stored, and existing accounts may have mixed case.
export const emailSchema = z.string().email("Enter a valid email address.").max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Error code the Credentials provider throws for a correct password on an unverified email.
export const EMAIL_NOT_VERIFIED = "EmailNotVerified";
