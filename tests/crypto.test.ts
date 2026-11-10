import { describe, it, expect } from "vitest"
import { encryptSecret, decryptSecret } from "@/lib/security/crypto"

describe("crypto encryption & decryption", () => {
  it("encrypts and decrypts a plain text string correctly", () => {
    const original = "sk-or-v1-my-secret-key-12345"
    const encrypted = encryptSecret(original)

    expect(encrypted).not.toBe(original)
    expect(encrypted.startsWith("enc_v1:")).toBe(true)

    const decrypted = decryptSecret(encrypted)
    expect(decrypted).toBe(original)
  })

  it("produces different ciphertexts for the same plaintext due to random IV", () => {
    const text = "another-secret"
    const enc1 = encryptSecret(text)
    const enc2 = encryptSecret(text)

    expect(enc1).not.toBe(enc2)
    expect(decryptSecret(enc1)).toBe(text)
    expect(decryptSecret(enc2)).toBe(text)
  })

  it("strictly rejects unencrypted text if no prefix is present (CRIT-01)", () => {
    const plain = "unencrypted_legacy_key"
    expect(() => decryptSecret(plain)).toThrow("Unencrypted or invalid secret format rejected")
  })

  it("handles empty or falsy strings cleanly", () => {
    expect(encryptSecret("")).toBe("")
    expect(decryptSecret("")).toBe("")
  })

  it("throws error if ciphertext format is tampered with", () => {
    const original = "secret"
    const encrypted = encryptSecret(original)
    const tampered = encrypted.slice(0, -4) + "0000"

    expect(() => decryptSecret(tampered)).toThrow()
  })
})
