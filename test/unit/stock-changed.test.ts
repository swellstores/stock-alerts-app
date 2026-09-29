import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { MAX_NOTIFIED } from "../../functions/stock-changed";
import { createMockRequest } from "../helpers/mock-request";

const PRODUCT_ID = "6abb4b2879ef310013b8a843";
const VARIANT_ID = "6ab6833878271b0012b94110";

afterEach(() => {
  vi.restoreAllMocks();
});

interface Setup {
  settings?: Record<string, any>;
  product?: Record<string, any>;
  waiting?: (where: Record<string, any>) => { results: Array<{ id: string }>; count: number };
  openAlert?: { id: string } | null;
  get?: (url: string, query: any) => Promise<any>;
}

function request(eventData: Record<string, any>, setup: Setup = {}) {
  const get = vi.fn(
    setup.get ??
      (async (url: string, query: any) => {
        if (url === "/stock-subscriptions") return setup.waiting?.(query.where) ?? { results: [], count: 0 };
        if (url === "/low-stock-alerts") return { results: setup.openAlert ? [setup.openAlert] : [] };
        return null;
      }),
  );
  const post = vi.fn(async (url: string, data: any) => (url === "/:batch" ? data.map(() => ({ id: "x" })) : { id: "alert-1" }));
  const put = vi.fn(async () => ({}));
  const settings = vi.fn(async () => ({ "stock-alerts": { ...setup.settings } }));
  const req = createMockRequest({
    data: {
      id: PRODUCT_ID,
      stock_tracking: true,
      ...setup.product,
      $event: { id: "evt", type: "product.stock_adjusted", model: "products", data: { id: PRODUCT_ID, ...eventData } },
    },
    swell: { get, post, put, settings },
  });
  return { req, get, post, put };
}

const waitingQueries = (get: ReturnType<typeof vi.fn>) =>
  get.mock.calls.filter(([url]) => url === "/stock-subscriptions").map(([, query]) => query);

const batches = (post: ReturnType<typeof vi.fn>) => post.mock.calls.filter(([url]) => url === "/:batch").map(([, ops]) => ops);

describe("stock-changed: back in stock", () => {
  it("marks product-level waiting subscriptions notified in one batch", async () => {
    const { req, get, post } = request(
      { prev_stock_level: 0, stock_level: 10 },
      { waiting: () => ({ results: [{ id: "s1" }, { id: "s2" }], count: 2 }) },
    );

    await handler(req);

    expect(waitingQueries(get)).toEqual([
      { where: { product_id: PRODUCT_ID, status: "waiting", variant_id: { $exists: false } }, fields: "id", limit: 100 },
    ]);
    const [ops] = batches(post);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      method: "put",
      url: "/stock-subscriptions/s1",
      data: { status: "notified", date_notified: expect.any(String) },
    });
    expect(ops[1].url).toBe("/stock-subscriptions/s2");
  });

  it("queries the restocked variant and product-level subscriptions separately", async () => {
    const { req, get } = request({
      prev_stock_level: 0,
      stock_level: 4,
      variant_id: VARIANT_ID,
      prev_variant_stock_level: 0,
      variant_stock_level: 4,
    });

    await handler(req);

    expect(waitingQueries(get).map((q) => q.where)).toEqual([
      { product_id: PRODUCT_ID, status: "waiting", variant_id: { $exists: false } },
      { product_id: PRODUCT_ID, status: "waiting", variant_id: VARIANT_ID },
    ]);
  });

  it("notifies every subscription of the product when variant matching is off", async () => {
    const { req, get } = request({ prev_stock_level: 0, stock_level: 4 }, { settings: { notify_variant_level: false } });

    await handler(req);

    expect(waitingQueries(get).map((q) => q.where)).toEqual([{ product_id: PRODUCT_ID, status: "waiting" }]);
  });

  it("does nothing without a restock transition", async () => {
    const { req, get, post } = request({ prev_stock_level: 3, stock_level: 5 }, { settings: { low_stock_enabled: false } });

    await handler(req);

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("skips back-in-stock when it is disabled", async () => {
    const { req, get } = request(
      { prev_stock_level: 0, stock_level: 10 },
      { settings: { back_in_stock_enabled: false, low_stock_enabled: false } },
    );

    await handler(req);

    expect(get).not.toHaveBeenCalled();
  });

  it("stops at the per-invocation cap and warns about the remainder", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}` }));
    const { req, post } = request(
      { prev_stock_level: 0, stock_level: 10 },
      { settings: { low_stock_enabled: false }, waiting: () => ({ results: page, count: 1000 }) },
    );

    await handler(req);

    expect(batches(post)).toHaveLength(MAX_NOTIFIED / 100);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1000 waiting subscription(s)"));
  });

  it("warns when batch slots fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { req, post } = request(
      { prev_stock_level: 0, stock_level: 10 },
      { settings: { low_stock_enabled: false }, waiting: () => ({ results: [{ id: "s1" }, { id: "s2" }], count: 2 }) },
    );
    post.mockImplementation(async () => [{ id: "s1" }, { $error: "Resource not found" }] as any);

    await handler(req);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1 of 2 subscription update(s) failed"), expect.any(String));
  });

  it("shares one budget across the product and variant targets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending: Record<string, string[]> = {
      product: Array.from({ length: 300 }, (_, i) => `p${i}`),
      variant: Array.from({ length: 300 }, (_, i) => `v${i}`),
    };
    const key = (where: Record<string, any>) => (where.variant_id === VARIANT_ID ? "variant" : "product");
    const { req, post } = request(
      { prev_stock_level: 0, stock_level: 4, variant_id: VARIANT_ID, prev_variant_stock_level: 0, variant_stock_level: 4 },
      {
        settings: { low_stock_enabled: false },
        waiting: (where) => {
          const ids = pending[key(where)];
          return { results: ids.slice(0, 100).map((id) => ({ id })), count: ids.length };
        },
      },
    );
    post.mockImplementation(async (_url: string, ops: any) => {
      for (const op of ops) {
        const id = op.url.split("/").pop();
        for (const list of Object.values(pending)) {
          const index = list.indexOf(id);
          if (index >= 0) list.splice(index, 1);
        }
      }
      return ops.map(() => ({}));
    });

    await handler(req);

    const ids = batches(post).flat().map((op: any) => op.url.split("/").pop());
    expect(ids).toHaveLength(MAX_NOTIFIED);
    expect(ids.filter((id: string) => id.startsWith("p"))).toHaveLength(300);
    expect(ids.filter((id: string) => id.startsWith("v"))).toHaveLength(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("100 waiting subscription(s)"));
  });

  it("stops within the budget when batch slots keep failing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}` }));
    const { req, post } = request(
      { prev_stock_level: 0, stock_level: 10 },
      { settings: { low_stock_enabled: false }, waiting: () => ({ results: page, count: 150 }) },
    );
    post.mockImplementation(async (_url: string, ops: any) => ops.map(() => ({ $error: "Conflict" })));

    await handler(req);

    expect(batches(post)).toHaveLength(MAX_NOTIFIED / 100);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("100 of 100 subscription update(s) failed"), expect.any(String));
  });

  it("does nothing when the payload has no event", async () => {
    const get = vi.fn(async () => null);
    const post = vi.fn();
    const put = vi.fn();
    const settings = vi.fn(async () => ({ "stock-alerts": {} }));
    const req = createMockRequest({ data: { id: PRODUCT_ID, stock_tracking: true }, swell: { get, post, put, settings } });

    await expect(handler(req)).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("stock-changed: low stock", () => {
  it("opens an alert when stock crosses the threshold", async () => {
    const { req, get, post } = request({ prev_stock_level: 10, stock_level: 4 });

    await handler(req);

    expect(get).toHaveBeenCalledWith("/low-stock-alerts", {
      where: { product_id: PRODUCT_ID, status: "open" },
      fields: "id",
      limit: 1,
    });
    expect(post).toHaveBeenCalledWith("/low-stock-alerts", {
      product_id: PRODUCT_ID,
      stock_level: 4,
      threshold: 5,
      status: "open",
    });
  });

  it("does not open a second alert while one is open", async () => {
    const { req, post } = request({ prev_stock_level: 10, stock_level: 4 }, { openAlert: { id: "alert-1" } });

    await handler(req);

    expect(post).not.toHaveBeenCalled();
  });

  it("does not alert again on a further drop", async () => {
    const { req, get, post } = request({ prev_stock_level: 4, stock_level: 3 });

    await handler(req);

    expect(get).not.toHaveBeenCalledWith("/low-stock-alerts", expect.anything());
    expect(post).not.toHaveBeenCalled();
  });

  it("resolves the open alert once stock recovers", async () => {
    const { req, put } = request({ prev_stock_level: 3, stock_level: 8 }, { openAlert: { id: "alert-1" } });

    await handler(req);

    expect(put).toHaveBeenCalledWith("/low-stock-alerts/alert-1", {
      status: "resolved",
      date_resolved: expect.any(String),
    });
  });

  it("does nothing on recovery without an open alert", async () => {
    const { req, put } = request({ prev_stock_level: 3, stock_level: 8 });

    await handler(req);

    expect(put).not.toHaveBeenCalled();
  });

  it("uses the configured threshold", async () => {
    const { req, post } = request({ prev_stock_level: 12, stock_level: 9 }, { settings: { low_stock_threshold: 10 } });

    await handler(req);

    expect(post).toHaveBeenCalledWith("/low-stock-alerts", expect.objectContaining({ threshold: 10, stock_level: 9 }));
  });

  it("uses the product's own threshold over the setting", async () => {
    const { req, post } = request(
      { prev_stock_level: 3, stock_level: 2 },
      { settings: { low_stock_threshold: 10 }, product: { $app: { stock_alerts: { low_stock_threshold: 2 } } } },
    );

    await handler(req);

    expect(post).toHaveBeenCalledWith("/low-stock-alerts", expect.objectContaining({ threshold: 2, stock_level: 2 }));
  });

  it("reads the product's threshold from the record when the event payload lacks it", async () => {
    const { req, get, post } = request(
      { prev_stock_level: 3, stock_level: 2 },
      {
        settings: { low_stock_threshold: 10 },
        get: async (url: string) => {
          if (url === `/products/${PRODUCT_ID}`) return { id: PRODUCT_ID, $app: { stock_alerts: { low_stock_threshold: 2 } } };
          if (url === "/low-stock-alerts") return { results: [] };
          return null;
        },
      },
    );

    await handler(req);

    expect(get).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, { fields: "$app.stock_alerts.low_stock_threshold" });
    expect(post).toHaveBeenCalledWith("/low-stock-alerts", expect.objectContaining({ threshold: 2, stock_level: 2 }));
  });

  it("falls back to the setting when the product threshold is zero, absent or not an integer", async () => {
    for (const product of [
      { $app: { stock_alerts: { low_stock_threshold: 0 } } },
      { $app: { stock_alerts: {} } },
      { $app: { stock_alerts: { low_stock_threshold: "2" } } },
      {},
    ]) {
      const { req, post } = request({ prev_stock_level: 12, stock_level: 9 }, { settings: { low_stock_threshold: 10 }, product });

      await handler(req);

      expect(post).toHaveBeenCalledWith("/low-stock-alerts", expect.objectContaining({ threshold: 10, stock_level: 9 }));
    }
  });

  it("skips products without stock tracking turned on and when low stock is disabled", async () => {
    for (const product of [{ stock_tracking: false }, { stock_tracking: undefined }]) {
      const untracked = request({ prev_stock_level: 10, stock_level: 4 }, { product });
      await handler(untracked.req);
      expect(untracked.post).not.toHaveBeenCalled();
    }

    const disabled = request({ prev_stock_level: 10, stock_level: 4 }, { settings: { low_stock_enabled: false } });
    await handler(disabled.req);
    expect(disabled.post).not.toHaveBeenCalled();
  });
});

describe("stock-changed: errors", () => {
  it("rethrows platform errors of 500 and above so the event is retried", async () => {
    const failure = Object.assign(new Error("Service unavailable"), { status: 503 });
    const { req } = request({ prev_stock_level: 10, stock_level: 4 }, { get: async () => Promise.reject(failure) });

    await expect(handler(req)).rejects.toBe(failure);
  });

  it("rethrows rate-limit errors so the event is retried", async () => {
    const failure = Object.assign(new Error("Too many requests"), { status: 429 });
    const { req } = request({ prev_stock_level: 10, stock_level: 4 }, { get: async () => Promise.reject(failure) });

    await expect(handler(req)).rejects.toBe(failure);
  });

  it("rethrows errors without a status so network failures are retried", async () => {
    const failure = new Error("fetch failed");
    const { req } = request({ prev_stock_level: 10, stock_level: 4 }, { get: async () => Promise.reject(failure) });

    await expect(handler(req)).rejects.toBe(failure);
  });

  it("converts other failures into a non-retried SwellError", async () => {
    const failure = Object.assign(new Error("Bad request"), { status: 400 });
    const { req } = request({ prev_stock_level: 10, stock_level: 4 }, { get: async () => Promise.reject(failure) });

    const err = await handler(req).catch((e) => e);
    expect(err).not.toBe(failure);
    expect(err.name).toBe("SwellError");
    expect(err.message).toBe("Bad request");
    expect(err.retry).toBe(false);
  });
});
