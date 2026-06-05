import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createToken, isValidToken } from "./session";

const TEST_SECRET = "unit-test-session-secret";

before(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

describe("session tokens", () => {
  it("creates a token that validates", async () => {
    const token = await createToken(TEST_SECRET);
    assert.equal(await isValidToken(token), true);
  });

  it("rejects missing and malformed tokens", async () => {
    assert.equal(await isValidToken(undefined), false);
    assert.equal(await isValidToken(""), false);
    assert.equal(await isValidToken("not.valid"), false);
    assert.equal(await isValidToken("v1.exp.sig"), false);
  });

  it("rejects tampered signatures", async () => {
    const token = await createToken(TEST_SECRET);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.0000000000000000000000000000000000000000000000000000000000000000`;
    assert.equal(await isValidToken(tampered), false);
  });
});
