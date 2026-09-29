import { lowStockAction, restockTargets, type RestockTarget, type StockEventData } from './lib/stock-rules';
import { PAGE_SIZE, findOpenAlert, listWaiting, markNotified } from './lib/subscriptions';

export const config: SwellConfig = {
  description: 'Email waiting subscribers on restock and raise or resolve low-stock alerts',
  model: {
    events: ['product.stock_adjusted'],
  },
};

export const MAX_NOTIFIED = 500;

async function notifyTarget(swell: SwellAPI, target: RestockTarget, budget: number) {
  let processed = 0;
  while (true) {
    const { ids, count } = await listWaiting(swell, target);
    if (!ids.length) return { processed, remaining: 0 };
    if (processed >= budget) return { processed, remaining: count };
    const batch = ids.slice(0, Math.min(PAGE_SIZE, budget - processed));
    await markNotified(swell, batch);
    processed += batch.length;
    if (count <= batch.length) return { processed, remaining: 0 };
  }
}

async function notifyRestocked(swell: SwellAPI, targets: RestockTarget[], productId: string) {
  let budget = MAX_NOTIFIED;
  let remaining = 0;
  for (const target of targets) {
    const result = await notifyTarget(swell, target, budget);
    budget -= result.processed;
    remaining += result.remaining;
  }
  if (remaining) {
    console.warn(`Stock alerts: ${remaining} waiting subscription(s) for product ${productId} were not notified (limit ${MAX_NOTIFIED} per restock)`);
  }
}

async function productThreshold(swell: SwellAPI, product: Record<string, any>): Promise<unknown> {
  const own = product.$app?.stock_alerts?.low_stock_threshold;
  if (own !== undefined) return own;
  const record: Record<string, any> | null = await swell.get(`/products/${product.id}`, {
    fields: '$app.stock_alerts.low_stock_threshold',
  });
  return record?.$app?.stock_alerts?.low_stock_threshold;
}

async function updateLowStock(
  swell: SwellAPI,
  product: Record<string, any>,
  eventData: StockEventData,
  settings: Record<string, any>,
) {
  const action = lowStockAction(eventData, settings, await productThreshold(swell, product));
  if (action.type === 'none') return;

  const open = await findOpenAlert(swell, product.id);
  if (action.type === 'open' && !open) {
    await swell.post('/low-stock-alerts', {
      product_id: product.id,
      stock_level: eventData.stock_level,
      threshold: action.threshold,
      status: 'open',
    });
  }
  if (action.type === 'resolve' && open) {
    await swell.put(`/low-stock-alerts/${open.id}`, {
      status: 'resolved',
      date_resolved: new Date().toISOString(),
    });
  }
}

async function handle(req: SwellRequest) {
  const settings = (await req.swell.settings())['stock-alerts'] ?? {};
  const product = req.data;
  const eventData: StockEventData = { ...(product.$event?.data ?? {}), id: product.id };

  if (settings.back_in_stock_enabled !== false) {
    const targets = restockTargets(eventData, settings);
    if (targets.length) await notifyRestocked(req.swell, targets, product.id);
  }

  if (settings.low_stock_enabled !== false && product.stock_tracking === true) {
    await updateLowStock(req.swell, product, eventData, settings);
  }
}

export default async function (req: SwellRequest) {
  try {
    await handle(req);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === undefined || status === 429 || status >= 500) throw err;
    throw new SwellError(err instanceof Error ? err.message : String(err), { retry: false });
  }
}
