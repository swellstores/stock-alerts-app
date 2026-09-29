import { describe, expect, it } from "vitest";
import { isObjectId, isValidEmail, normalizeEmail, parseSubscribeInput } from "../../functions/lib/validate";

const PRODUCT_ID = "6abb4b2879ef310013b8a843";
const VARIANT_ID = "6ab6833878271b0012b94110";

function parseError(data: Record<string, any> | null) {
  try {
    parseSubscribeInput(data);
  } catch (err) {
    return err as SwellError;
  }
  throw new Error("expected parseSubscribeInput to throw");
}

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana@Swell.IS ")).toBe("ana@swell.is");
  });

  it("returns an empty string for non-strings", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});

describe("isValidEmail", () => {
  it.each(["ana@swell.is", "first.last+tag@example.co.uk"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "ana", "ana@swell", "ana @swell.is", "@swell.is", `${"a".repeat(250)}@x.io`])(
    "rejects %j",
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe("isObjectId", () => {
  it("accepts 24 hex characters", () => {
    expect(isObjectId(PRODUCT_ID)).toBe(true);
    expect(isObjectId(PRODUCT_ID.toUpperCase())).toBe(true);
  });

  it.each([undefined, null, 123, "", "abc", `${PRODUCT_ID}0`, "zzzzzzzzzzzzzzzzzzzzzzzz"])("rejects %j", (value) => {
    expect(isObjectId(value)).toBe(false);
  });
});

describe("parseSubscribeInput", () => {
  it("normalises the email and defaults the source", () => {
    expect(parseSubscribeInput({ email: " Ana@Swell.is ", product_id: PRODUCT_ID })).toEqual({
      email: "ana@swell.is",
      product_id: PRODUCT_ID,
      source: "storefront",
    });
  });

  it("keeps a variant id and a custom source", () => {
    expect(
      parseSubscribeInput({ email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID, source: " pdp " }),
    ).toEqual({ email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID, source: "pdp" });
  });

  it("ignores an empty variant id", () => {
    expect(parseSubscribeInput({ email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: "" })).not.toHaveProperty(
      "variant_id",
    );
  });

  it("rejects a bad email with 400 without echoing it", () => {
    const err = parseError({ email: "secret-address", product_id: PRODUCT_ID });
    expect(err.status).toBe(400);
    expect(err.message).toBe("A valid email is required");
    expect(err.message).not.toContain("secret-address");
  });

  it("rejects a missing or malformed product id with 400", () => {
    expect(parseError({ email: "ana@swell.is" }).message).toBe("A valid product_id is required");
    expect(parseError({ email: "ana@swell.is", product_id: "abc" }).status).toBe(400);
  });

  it("rejects a malformed variant id with 400", () => {
    const err = parseError({ email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: "nope" });
    expect(err.status).toBe(400);
    expect(err.message).toBe("variant_id must be a valid id");
  });

  it("rejects an empty payload", () => {
    expect(parseError(null).status).toBe(400);
  });
});
