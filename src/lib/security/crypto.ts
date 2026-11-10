import fs from "fs"
import path from "path"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { getAppSecret } from "@/lib/auth-utils"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const PREFIX = "enc_v1:"

let cachedPersistentSecret: string | null = null

function getEncryptionKey(): Buffer {
  let secret = process.env.ENCRYPTION_SECRET || process.env.AUTH_SECRET || process.env.SESSION_SECRET
  if (!secret) {
    if (!cachedPersistentSecret) {
      const keyFile = path.join(process.cwd(), "prisma", ".encryption_key")
      try {
        if (fs.existsSync(keyFile)) {
          cachedPersistentSecret = fs.readFileSync(keyFile, "utf8").trim()
        } else {
          cachedPersistentSecret = randomBytes(32).toString("hex")
          const dir = path.dirname(keyFile)
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }
          fs.writeFileSync(keyFile, cachedPersistentSecret, { encoding: "utf8", mode: 0o600 })
        }
      } catch {
        cachedPersistentSecret = getAppSecret()
      }
    }
    secret = cachedPersistentSecret
  }
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
 * Rejects unencrypted input or inputs without the valid prefix to prevent cryptographic bypasses.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText || typeof cipherText !== "string") return ""
  if (!cipherText.startsWith(PREFIX)) {
    throw new Error("Unencrypted or invalid secret format rejected")
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
