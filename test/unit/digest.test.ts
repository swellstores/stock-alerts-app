import { describe, expect, it, vi } from "vitest";
import digest from "../../functions/digest";
import { createMockRequest } from "../helpers/mock-request";

function request(enabled: boolean | undefined, pages: Array<Array<Record<string, any>>>) {
  const get = vi.fn(async (_url: string, query: { page: number }) => ({ results: pages[query.page - 1] ?? [] }));
  const post = vi.fn(async () => ({ id: "digest-1" }));
  const settings = vi.fn(async () => ({ "stock-alerts": { low_stock_digest_enabled: enabled } }));
  const req = createMockRequest({ swell: { get, post, settings } });
  return { req, get, post };
}

describe("digest cron", () => {
  it("does nothing unless the digest is enabled", async () => {
    const { req, get, post } = request(undefined, []);

    await digest(req);

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("does not write a digest when no alerts are open", async () => {
    const { req, get, post } = request(true, [[]]);

    await digest(req);

    expect(get).toHaveBeenCalledWith("/low-stock-alerts", {
      where: { status: "open" },
      expand: "product",
      limit: 100,
      page: 1,
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("writes one digest record listing every open alert", async () => {
    const { req, post } = request(true, [
      [
        { product_id: "p1", stock_level: 4, threshold: 5, product: { name: "Sweater", stock_level: 3 } },
        { product_id: "p2", stock_level: 2, threshold: 5, product: null },
      ],
    ]);

    await digest(req);

    expect(post).toHaveBeenCalledWith("/low-stock-digests", {
      alert_count: 2,
      items: [
        { product_id: "p1", product_name: "Sweater", stock_level: 3, threshold: 5 },
        { product_id: "p2", product_name: "", stock_level: 2, threshold: 5 },
      ],
      date_sent: expect.any(String),
    });
  });

  it("uses the product's total stock across variants when it differs from its stock level", async () => {
    const { req, post } = request(true, [
      [{ product_id: "p1", stock_level: 4, threshold: 5, product: { name: "Sweater", stock_level: 2, stock_level_total: 5 } }],
    ]);

    await digest(req);

    expect(post).toHaveBeenCalledWith("/low-stock-digests", {
      alert_count: 1,
      items: [{ product_id: "p1", product_name: "Sweater", stock_level: 5, threshold: 5 }],
      date_sent: expect.any(String),
    });
  });

  it("pages through at most five pages of alerts", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ product_id: `p${i}`, stock_level: 1, threshold: 5 }));
    const { req, get, post } = request(true, [full, full, full, full, full, full]);

    await digest(req);

    expect(get).toHaveBeenCalledTimes(5);
    expect(post).toHaveBeenCalledWith("/low-stock-digests", expect.objectContaining({ alert_count: 500 }));
  });
});
