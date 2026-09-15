import bcrypt from "bcrypt";

/**
 * Cost factor for bcrypt.
 *
 * 12 rounds ≈ 250 ms on a 2024 server core — expensive enough to make
 * offline dictionary attacks impractical, fast enough for normal traffic.
 * Raise to 13 if your hardware budget allows; never go below 10.
 */
const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password.
 *
 * @param plain - The password the user typed.
 * @returns The bcrypt hash to persist in the database.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare a plain-text candidate against a stored bcrypt hash.
 *
 * Uses bcrypt's timing-safe comparison — never use `===` for this.
 *
 * @param plain  - The password the user typed at login.
 * @param hash   - The hash stored in `User.passwordHash`.
 * @returns `true` if the password matches, `false` otherwise.
 */
export async function comparePassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
