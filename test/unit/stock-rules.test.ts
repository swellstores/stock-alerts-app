import { describe, expect, it } from "vitest";
import { lowStockAction, lowStockThreshold, restockTargets, restocked } from "../../functions/lib/stock-rules";

const ID = "6abb4b2879ef310013b8a843";
const VARIANT = "6ab6833878271b0012b94110";

describe("restocked", () => {
  it("is true only when stock moves from zero or below to above zero", () => {
    expect(restocked(0, 10)).toBe(true);
    expect(restocked(-2, 1)).toBe(true);
    expect(restocked(0, 0)).toBe(false);
    expect(restocked(3, 5)).toBe(false);
    expect(restocked(5, 0)).toBe(false);
    expect(restocked(null, 5)).toBe(false);
    expect(restocked(undefined, 5)).toBe(false);
    expect(restocked(0, undefined)).toBe(false);
  });
});

describe("restockTargets", () => {
  it("targets product-level subscriptions on a product restock", () => {
    expect(restockTargets({ id: ID, prev_stock_level: 0, stock_level: 10 }, {})).toEqual([
      { product_id: ID, variant_id: null },
    ]);
  });

  it("targets every subscription of the product when variant matching is off", () => {
    expect(
      restockTargets({ id: ID, prev_stock_level: 0, stock_level: 10 }, { notify_variant_level: false }),
    ).toEqual([{ product_id: ID, variant_id: undefined }]);
  });

  it("targets the variant and the product when both restock", () => {
    expect(
      restockTargets(
        { id: ID, prev_stock_level: 0, stock_level: 4, variant_id: VARIANT, prev_variant_stock_level: 0, variant_stock_level: 4 },
        {},
      ),
    ).toEqual([
      { product_id: ID, variant_id: null },
      { product_id: ID, variant_id: VARIANT },
    ]);
  });

  it("targets only the variant when the product was already in stock", () => {
    expect(
      restockTargets(
        { id: ID, prev_stock_level: 3, stock_level: 5, variant_id: VARIANT, prev_variant_stock_level: 0, variant_stock_level: 2 },
        {},
      ),
    ).toEqual([{ product_id: ID, variant_id: VARIANT }]);
  });

  it("collapses to a single any-variant target when variant matching is off", () => {
    expect(
      restockTargets(
        { id: ID, prev_stock_level: 0, stock_level: 4, variant_id: VARIANT, prev_variant_stock_level: 0, variant_stock_level: 4 },
        { notify_variant_level: false },
      ),
    ).toEqual([{ product_id: ID, variant_id: undefined }]);
  });

  it("still targets a restocked variant when variant matching is off but the product did not restock", () => {
    expect(
      restockTargets(
        { id: ID, prev_stock_level: 3, stock_level: 5, variant_id: VARIANT, prev_variant_stock_level: 0, variant_stock_level: 2 },
        { notify_variant_level: false },
      ),
    ).toEqual([{ product_id: ID, variant_id: VARIANT }]);
  });

  it("returns nothing when the previous level is unknown", () => {
    expect(restockTargets({ id: ID, prev_stock_level: null, stock_level: 10 }, {})).toEqual([]);
    expect(restockTargets({ id: ID, stock_level: 10, variant_id: VARIANT, variant_stock_level: 3 }, {})).toEqual([]);
  });

  it("returns nothing without a transition or a product id", () => {
    expect(restockTargets({ id: ID, prev_stock_level: 5, stock_level: 6 }, {})).toEqual([]);
    expect(restockTargets({ id: ID, prev_stock_level: 5, stock_level: 0 }, {})).toEqual([]);
    expect(restockTargets({ prev_stock_level: 0, stock_level: 6 }, {})).toEqual([]);
  });
});

describe("lowStockThreshold", () => {
  it("defaults to 5", () => {
    expect(lowStockThreshold({})).toBe(5);
    expect(lowStockThreshold({ low_stock_threshold: null })).toBe(5);
  });

  it("uses the setting, including zero and numeric strings", () => {
    expect(lowStockThreshold({ low_stock_threshold: 10 })).toBe(10);
    expect(lowStockThreshold({ low_stock_threshold: 0 })).toBe(0);
    expect(lowStockThreshold({ low_stock_threshold: "7" })).toBe(7);
  });

  it("falls back to 5 on a non-numeric setting", () => {
    expect(lowStockThreshold({ low_stock_threshold: "lots" })).toBe(5);
  });

  it("prefers a positive integer product threshold over the setting", () => {
    expect(lowStockThreshold({ low_stock_threshold: 10 }, 2)).toBe(2);
    expect(lowStockThreshold({}, 20)).toBe(20);
  });

  it("falls back to the setting when the product threshold is zero, absent or not an integer", () => {
    expect(lowStockThreshold({ low_stock_threshold: 10 }, 0)).toBe(10);
    expect(lowStockThreshold({ low_stock_threshold: 10 }, undefined)).toBe(10);
    expect(lowStockThreshold({ low_stock_threshold: 10 }, null)).toBe(10);
    expect(lowStockThreshold({ low_stock_threshold: 10 }, 2.5)).toBe(10);
    expect(lowStockThreshold({ low_stock_threshold: 10 }, "2")).toBe(10);
    expect(lowStockThreshold({ low_stock_threshold: 10 }, -3)).toBe(10);
    expect(lowStockThreshold({}, 0)).toBe(5);
  });
});

describe("lowStockAction", () => {
  it("opens when stock crosses down to or below the threshold", () => {
    expect(lowStockAction({ prev_stock_level: 10, stock_level: 4 }, {})).toEqual({ type: "open", threshold: 5 });
    expect(lowStockAction({ prev_stock_level: 6, stock_level: 5 }, {})).toEqual({ type: "open", threshold: 5 });
  });

  it("uses the threshold from settings", () => {
    expect(lowStockAction({ prev_stock_level: 12, stock_level: 9 }, { low_stock_threshold: 10 })).toEqual({
      type: "open",
      threshold: 10,
    });
    expect(lowStockAction({ prev_stock_level: 12, stock_level: 9 }, {}).type).toBe("resolve");
  });

  it("uses the product threshold when given", () => {
    expect(lowStockAction({ prev_stock_level: 3, stock_level: 2 }, { low_stock_threshold: 10 }, 2)).toEqual({
      type: "open",
      threshold: 2,
    });
    expect(lowStockAction({ prev_stock_level: 12, stock_level: 9 }, { low_stock_threshold: 10 }, 0)).toEqual({
      type: "open",
      threshold: 10,
    });
  });

  it("does not re-alert while already low", () => {
    expect(lowStockAction({ prev_stock_level: 4, stock_level: 3 }, {}).type).toBe("none");
  });

  it("does not alert without a crossing from above", () => {
    expect(lowStockAction({ prev_stock_level: 0, stock_level: 3 }, {}).type).toBe("none");
  });

  it("resolves once stock is back above the threshold", () => {
    expect(lowStockAction({ prev_stock_level: 3, stock_level: 8 }, {})).toEqual({ type: "resolve", threshold: 5 });
  });

  it("does nothing when levels are missing", () => {
    expect(lowStockAction({ stock_level: 3 }, {}).type).toBe("none");
    expect(lowStockAction({ prev_stock_level: 10, stock_level: null }, {}).type).toBe("none");
  });
});
