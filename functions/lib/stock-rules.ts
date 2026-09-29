export interface StockEventData {
  id?: string;
  stock_level?: number | null;
  prev_stock_level?: number | null;
  variant_id?: string | null;
  variant_stock_level?: number | null;
  prev_variant_stock_level?: number | null;
}

export interface StockSettings {
  notify_variant_level?: boolean;
  low_stock_threshold?: number | string | null;
}

export interface RestockTarget {
  product_id: string;
  variant_id: string | null | undefined;
}

export interface LowStockAction {
  type: 'none' | 'open' | 'resolve';
  threshold: number;
}

const DEFAULT_THRESHOLD = 5;

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function restocked(prev: unknown, next: unknown): boolean {
  return isNumber(prev) && isNumber(next) && prev <= 0 && next > 0;
}

export function restockTargets(eventData: StockEventData, settings: StockSettings): RestockTarget[] {
  const product_id = eventData.id;
  if (!product_id) return [];

  const targets: RestockTarget[] = [];
  if (restocked(eventData.prev_stock_level, eventData.stock_level)) {
    if (settings.notify_variant_level === false) return [{ product_id, variant_id: undefined }];
    targets.push({ product_id, variant_id: null });
  }
  if (eventData.variant_id && restocked(eventData.prev_variant_stock_level, eventData.variant_stock_level)) {
    targets.push({ product_id, variant_id: eventData.variant_id });
  }
  return targets;
}

export function lowStockThreshold(settings: StockSettings, productThreshold?: unknown): number {
  if (typeof productThreshold === 'number' && Number.isInteger(productThreshold) && productThreshold > 0) {
    return productThreshold;
  }
  const threshold = Number(settings.low_stock_threshold ?? DEFAULT_THRESHOLD);
  return Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD;
}

export function lowStockAction(
  eventData: StockEventData,
  settings: StockSettings,
  productThreshold?: unknown,
): LowStockAction {
  const threshold = lowStockThreshold(settings, productThreshold);
  const prev = eventData.prev_stock_level;
  const next = eventData.stock_level;
  if (!isNumber(prev) || !isNumber(next)) return { type: 'none', threshold };
  if (prev > threshold && next <= threshold) return { type: 'open', threshold };
  if (next > threshold) return { type: 'resolve', threshold };
  return { type: 'none', threshold };
}
