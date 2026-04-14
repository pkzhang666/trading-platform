import crypto from "node:crypto";

export function hashPassword(password: string, pepper: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(`${password}${pepper}`, salt, 64).toString("hex");
  return `${salt}$${derived}`;
}

export function verifyPassword(password: string, pepper: string, storedHash: string): boolean {
  const [salt, expectedHash] = storedHash.split("$");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(`${password}${pepper}`, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}
