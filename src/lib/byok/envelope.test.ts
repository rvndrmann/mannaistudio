import { describe, expect, it } from "vitest"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { ENCRYPTION_VERSION, keyLast4, openCredential, sealCredential, type KeyWrapper } from "./envelope"

/**
 * A stand-in for Cloud KMS: same contract, local key. The point of the tests is
 * the envelope — that the DEK never appears in the stored row, that tampering
 * with any part fails loudly, and that a wrapper which cannot unwrap gets no
 * plaintext.
 */
function testWrapper(masterKey = randomBytes(32)): KeyWrapper {
  return {
    async wrap(dek) {
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", masterKey, nonce)
      const body = Buffer.concat([cipher.update(dek), cipher.final()])
      return { wrapped: Buffer.concat([nonce, cipher.getAuthTag(), body]), keyVersion: "test/v1" }
    },
    async unwrap(wrapped) {
      const nonce = wrapped.subarray(0, 12)
      const tag = wrapped.subarray(12, 28)
      const decipher = createDecipheriv("aes-256-gcm", masterKey, nonce)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(wrapped.subarray(28)), decipher.final()])
    },
  }
}

const openaiKey = { apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz1234" }

// BytePlus is the reason parts are an object: generation needs the ARK key, and
// the Asset Library registration that clears Seedance's real-person check needs
// the access/secret pair and a group id besides.
const bytePlusKey = {
  arkApiKey: "ark-abcdefghijklmnop1234",
  accessKey: "AKLTaccesskeyvalue0001",
  secretKey: "c2VjcmV0a2V5dmFsdWUwMDAx",
  assetGroupId: "group-8891",
}

describe("sealing a provider credential", () => {
  it("round-trips a single-part credential", async () => {
    const wrapper = testWrapper()
    const sealed = await sealCredential(openaiKey, wrapper)
    await expect(openCredential(sealed, wrapper)).resolves.toEqual(openaiKey)
  })

  it("round-trips a multi-part credential under one key and one tag", async () => {
    const wrapper = testWrapper()
    const sealed = await sealCredential(bytePlusKey, wrapper)
    await expect(openCredential(sealed, wrapper)).resolves.toEqual(bytePlusKey)
  })

  it("never leaves the secret or the data key readable in what gets stored", async () => {
    const wrapper = testWrapper()
    const sealed = await sealCredential(bytePlusKey, wrapper)
    const stored = Buffer.concat([sealed.encryptedSecret, sealed.encryptedDek, sealed.nonce, sealed.authTag]).toString("latin1")
    for (const value of Object.values(bytePlusKey)) {
      expect(stored).not.toContain(value)
    }
  })

  it("uses a fresh data key and nonce every time, so two saves never match", async () => {
    const wrapper = testWrapper()
    const first = await sealCredential(openaiKey, wrapper)
    const second = await sealCredential(openaiKey, wrapper)
    expect(first.encryptedSecret.equals(second.encryptedSecret)).toBe(false)
    expect(first.nonce.equals(second.nonce)).toBe(false)
    expect(first.encryptedDek.equals(second.encryptedDek)).toBe(false)
  })

  it("records the scheme and key version, so a rotation knows what to re-wrap", async () => {
    const sealed = await sealCredential(openaiKey, testWrapper())
    expect(sealed.encryptionVersion).toBe(ENCRYPTION_VERSION)
    expect(sealed.kmsKeyVersion).toBe("test/v1")
  })
})

describe("a tampered row fails rather than decrypting to something", () => {
  const cases: Array<[string, (sealed: { encryptedSecret: Buffer; encryptedDek: Buffer; nonce: Buffer; authTag: Buffer }) => void]> = [
    ["ciphertext", (sealed) => { sealed.encryptedSecret[0] ^= 0xff }],
    ["nonce", (sealed) => { sealed.nonce[0] ^= 0xff }],
    ["auth tag", (sealed) => { sealed.authTag[0] ^= 0xff }],
    ["wrapped data key", (sealed) => { sealed.encryptedDek[sealed.encryptedDek.length - 1] ^= 0xff }],
  ]

  for (const [name, tamper] of cases) {
    it(`rejects a modified ${name}`, async () => {
      const wrapper = testWrapper()
      const sealed = await sealCredential(bytePlusKey, wrapper)
      tamper(sealed)
      await expect(openCredential(sealed, wrapper)).rejects.toThrow()
    })
  }

  it("gives nothing to a different KMS key", async () => {
    const sealed = await sealCredential(openaiKey, testWrapper())
    // What an attacker holding the database rows but not the KMS key has.
    await expect(openCredential(sealed, testWrapper())).rejects.toThrow()
  })

  it("refuses a version it does not understand", async () => {
    const wrapper = testWrapper()
    const sealed = await sealCredential(openaiKey, wrapper)
    await expect(openCredential({ ...sealed, encryptionVersion: 99 }, wrapper)).rejects.toThrow(/version/i)
  })
})

describe("what the interface refuses", () => {
  it("will not seal an empty or malformed credential", async () => {
    const wrapper = testWrapper()
    await expect(sealCredential({}, wrapper)).rejects.toThrow(/no parts/i)
    await expect(sealCredential({ apiKey: "   " }, wrapper)).rejects.toThrow(/non-empty/i)
  })
})

describe("the masked hint shown in the UI", () => {
  it("shows the last four of a real key", () => {
    expect(keyLast4("sk-proj-abcdefghijklmnop92AB")).toBe("92AB")
  })

  it("shows nothing for a secret too short to mask meaningfully", () => {
    // Four of six characters is not a hint, it is most of the key.
    expect(keyLast4("abc123")).toBe("")
  })
})
