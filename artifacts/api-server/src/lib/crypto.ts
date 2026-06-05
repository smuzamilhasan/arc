import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// App-level symmetric encryption for per-client secrets (e.g. a client's own
// third-party scheduler API key). The key comes from APP_ENCRYPTION_KEY in the
// environment. Per-client secrets are user data, so they live encrypted in the
// DB — never in app-level Replit secrets, which are global, not per-client.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce length
const AUTH_TAG_LENGTH = 16;

// Derive a stable 32-byte key from APP_ENCRYPTION_KEY. The env value may be a
// 64-char hex string (32 bytes) or any passphrase; hashing normalizes both to
// exactly 32 bytes. Resolved lazily so importing this module never throws — it
// only throws if encryption is actually attempted without a configured key.
function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. It is required to encrypt/decrypt stored scheduler API keys.",
    );
  }
  return createHash("sha256").update(raw).digest();
}

// Encrypt plaintext into a self-describing string: iv:authTag:ciphertext (hex).
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

// Decrypt a string produced by encryptSecret. Throws if the value is malformed
// or the auth tag does not verify (tampered or wrong key).
export function decryptSecret(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// True when an app-level encryption key is configured. Lets routes fail fast
// with a clear message instead of throwing deep in a handler.
export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEY);
}
