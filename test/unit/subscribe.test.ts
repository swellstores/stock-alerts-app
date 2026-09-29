import { describe, expect, it, vi } from "vitest";
import { post } from "../../functions/subscribe";
import { createMockRequest } from "../helpers/mock-request";

const PRODUCT_ID = "6abb4b2879ef310013b8a843";
const VARIANT_ID = "6ab6833878271b0012b94110";

interface Setup {
  settings?: Record<string, any>;
  product?: Record<string, any> | null;
  variant?: Record<string, any> | null;
  existing?: { id: string } | null;
}

function request(data: Record<string, any>, setup: Setup = {}) {
  const product = setup.product === undefined ? { id: PRODUCT_ID, active: true, stock_tracking: true, stock_level: 0 } : setup.product;
  const get = vi.fn(async (url: string) => {
    if (url === `/products/${PRODUCT_ID}`) return product;
    if (url.startsWith("/products:variants/")) return setup.variant ?? null;
    if (url === "/stock-subscriptions") return { results: setup.existing ? [setup.existing] : [] };
    throw Object.assign(new Error("Not found"), { status: 404 });
  });
  const postFn = vi.fn(async () => ({ id: "new-subscription" }));
  const settings = vi.fn(async () => ({ "stock-alerts": { back_in_stock_enabled: true, ...setup.settings } }));
  const req = createMockRequest({ data, swell: { get, post: postFn, settings } });
  return { req, get, post: postFn };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err as SwellError;
  }
  throw new Error("expected a rejection");
}

describe("subscribe route", () => {
  it("creates a waiting subscription for an out-of-stock product", async () => {
    const { req, post: create, get } = request({ email: " Ana@Swell.is ", product_id: PRODUCT_ID });

    await expect(post(req)).resolves.toEqual({ subscribed: true, id: "new-subscription", existing: false });
    expect(get).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, { fields: "id,name,active,stock_tracking,stock_level" });
    expect(get).toHaveBeenCalledWith("/stock-subscriptions", {
      where: { email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: { $exists: false }, status: "waiting" },
      fields: "id",
      limit: 1,
    });
    expect(create).toHaveBeenCalledWith("/stock-subscriptions", {
      email: "ana@swell.is",
      product_id: PRODUCT_ID,
      source: "storefront",
      status: "waiting",
    });
  });

  it("subscribes to a variant of the product", async () => {
    const { req, get, post: create } = request(
      { email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID, source: "pdp" },
      {
        product: { id: PRODUCT_ID, stock_tracking: true, stock_level: 5 },
        variant: { id: VARIANT_ID, parent_id: PRODUCT_ID, stock_level: 0 },
      },
    );

    await expect(post(req)).resolves.toMatchObject({ subscribed: true, existing: false });
    expect(get).toHaveBeenCalledWith("/stock-subscriptions", {
      where: { email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID, status: "waiting" },
      fields: "id",
      limit: 1,
    });
    expect(create).toHaveBeenCalledWith("/stock-subscriptions", {
      email: "ana@swell.is",
      product_id: PRODUCT_ID,
      variant_id: VARIANT_ID,
      source: "pdp",
      status: "waiting",
    });
  });

  it("short-circuits when the product is in stock", async () => {
    const { req, post: create } = request(
      { email: "ana@swell.is", product_id: PRODUCT_ID },
      { product: { id: PRODUCT_ID, stock_tracking: true, stock_level: 3 } },
    );

    await expect(post(req)).resolves.toEqual({ subscribed: false, in_stock: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("short-circuits when the product does not have stock tracking turned on", async () => {
    for (const stock_tracking of [false, undefined]) {
      const { req, post: create } = request(
        { email: "ana@swell.is", product_id: PRODUCT_ID },
        { product: { id: PRODUCT_ID, stock_tracking, stock_level: 0 } },
      );

      await expect(post(req)).resolves.toEqual({ subscribed: false, in_stock: true });
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("short-circuits when the variant is in stock", async () => {
    const { req } = request(
      { email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID },
      { variant: { id: VARIANT_ID, parent_id: PRODUCT_ID, stock_level: 2 } },
    );

    await expect(post(req)).resolves.toEqual({ subscribed: false, in_stock: true });
  });

  it("returns the existing waiting subscription instead of duplicating it", async () => {
    const { req, post: create } = request({ email: "ana@swell.is", product_id: PRODUCT_ID }, { existing: { id: "sub-1" } });

    await expect(post(req)).resolves.toEqual({ subscribed: true, id: "sub-1", existing: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("still saves the subscription when back-in-stock alerts are disabled", async () => {
    const { req, post: create } = request(
      { email: "ana@swell.is", product_id: PRODUCT_ID },
      { settings: { back_in_stock_enabled: false } },
    );

    await expect(post(req)).resolves.toEqual({ subscribed: true, id: "new-subscription", existing: false });
    expect(create).toHaveBeenCalledWith("/stock-subscriptions", {
      email: "ana@swell.is",
      product_id: PRODUCT_ID,
      source: "storefront",
      status: "waiting",
    });
  });

  it("rejects bad input with 400 before touching the store", async () => {
    const { req, get } = request({ email: "nope", product_id: PRODUCT_ID });

    expect((await rejection(post(req))).status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing product", async () => {
    const { req } = request({ email: "ana@swell.is", product_id: PRODUCT_ID }, { product: null });

    const err = await rejection(post(req));
    expect(err.status).toBe(404);
    expect(err.message).toBe("Product not found");
  });

  it("returns 404 when the product lookup itself 404s", async () => {
    const { req } = request({ email: "ana@swell.is", product_id: "0123456789abcdef01234567" });

    expect((await rejection(post(req))).status).toBe(404);
  });

  it("returns 404 for an inactive product", async () => {
    const { req } = request(
      { email: "ana@swell.is", product_id: PRODUCT_ID },
      { product: { id: PRODUCT_ID, active: false, stock_level: 0 } },
    );

    expect((await rejection(post(req))).message).toBe("Product not found");
  });

  it("returns 404 for a variant of another product", async () => {
    const { req } = request(
      { email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID },
      { variant: { id: VARIANT_ID, parent_id: "0123456789abcdef01234567", stock_level: 0 } },
    );

    const err = await rejection(post(req));
    expect(err.status).toBe(404);
    expect(err.message).toBe("Variant not found");
  });

  it("returns 404 for a missing variant", async () => {
    const { req } = request({ email: "ana@swell.is", product_id: PRODUCT_ID, variant_id: VARIANT_ID }, { variant: null });

    expect((await rejection(post(req))).message).toBe("Variant not found");
  });
});
