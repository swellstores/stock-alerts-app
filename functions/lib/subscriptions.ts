import type { RestockTarget } from './stock-rules';

export const PAGE_SIZE = 100;

const SUBSCRIPTIONS = '/stock-subscriptions';
const ALERTS = '/low-stock-alerts';

interface Ref {
  id: string;
}

interface Page<T> {
  results?: T[];
  count?: number;
}

interface BatchSlot {
  $error?: unknown;
  errors?: unknown;
}

function variantFilter(variant_id: string | null | undefined): unknown {
  return variant_id ?? { $exists: false };
}

export async function findWaiting(
  swell: SwellAPI,
  input: { email: string; product_id: string; variant_id?: string },
): Promise<Ref | null> {
  const page: Page<Ref> | null = await swell.get(SUBSCRIPTIONS, {
    where: {
      email: input.email,
      product_id: input.product_id,
      variant_id: variantFilter(input.variant_id),
      status: 'waiting',
    },
    fields: 'id',
    limit: 1,
  });
  return page?.results?.[0] ?? null;
}

export function waitingWhere(target: RestockTarget): Record<string, unknown> {
  const where: Record<string, unknown> = { product_id: target.product_id, status: 'waiting' };
  if (target.variant_id !== undefined) where.variant_id = variantFilter(target.variant_id);
  return where;
}

export async function listWaiting(
  swell: SwellAPI,
  target: RestockTarget,
): Promise<{ ids: string[]; count: number }> {
  const page: Page<Ref> | null = await swell.get(SUBSCRIPTIONS, {
    where: waitingWhere(target),
    fields: 'id',
    limit: PAGE_SIZE,
  });
  const ids = (page?.results ?? []).map((record) => record.id);
  return { ids, count: page?.count ?? ids.length };
}

export async function markNotified(swell: SwellAPI, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const data = { status: 'notified', date_notified: new Date().toISOString() };
  const results: BatchSlot[] | null = await swell.post(
    '/:batch',
    ids.map((id) => ({ method: 'put', url: `${SUBSCRIPTIONS}/${id}`, data })),
  );
  const failed = Array.isArray(results) ? results.filter((slot) => !slot || slot.$error || slot.errors) : [];
  if (failed.length) {
    console.warn(`Stock alerts: ${failed.length} of ${ids.length} subscription update(s) failed`, JSON.stringify(failed[0]));
  }
  return ids.length - failed.length;
}

export async function findOpenAlert(swell: SwellAPI, product_id: string): Promise<Ref | null> {
  const page: Page<Ref> | null = await swell.get(ALERTS, {
    where: { product_id, status: 'open' },
    fields: 'id',
    limit: 1,
  });
  return page?.results?.[0] ?? null;
}
