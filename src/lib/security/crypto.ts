import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { getAppSecret } from "@/lib/auth-utils"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const PREFIX = "enc_v1:"

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || getAppSecret()
  return createHash("sha256").update(secret).digest()
}

/**
 * Encrypts a string using AES-256-GCM authenticated encryption.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return plainText

  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

/**
 * Decrypts a string encrypted with encryptSecret.
 * If the input doesn't start with the encryption prefix, it returns the input as-is (graceful fallback).
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText || typeof cipherText !== "string") return cipherText
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText
  }

  const payload = cipherText.slice(PREFIX.length)
  const parts = payload.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format")
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}
