export const config: SwellConfig = {
  description: 'Daily digest of open low-stock alerts for store admins',
  cron: {
    schedule: '0 8 * * *',
  },
};

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

interface OpenAlert {
  product_id: string;
  stock_level?: number;
  threshold?: number;
  product?: { name?: string; stock_level?: number; stock_level_total?: number } | null;
}

async function listOpenAlerts(swell: SwellAPI): Promise<OpenAlert[]> {
  const alerts: OpenAlert[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result: { results?: OpenAlert[] } | null = await swell.get('/low-stock-alerts', {
      where: { status: 'open' },
      expand: 'product',
      limit: PAGE_SIZE,
      page,
    });
    const results = result?.results ?? [];
    alerts.push(...results);
    if (results.length < PAGE_SIZE) break;
  }
  return alerts;
}

export default async function (req: SwellRequest) {
  const settings = (await req.swell.settings())['stock-alerts'] ?? {};
  if (settings.low_stock_digest_enabled !== true) return;

  const alerts = await listOpenAlerts(req.swell);
  if (!alerts.length) return;

  const items = alerts.map((alert) => ({
    product_id: alert.product_id,
    product_name: alert.product?.name ?? '',
    stock_level: alert.product?.stock_level_total ?? alert.product?.stock_level ?? alert.stock_level,
    threshold: alert.threshold,
  }));

  await req.swell.post('/low-stock-digests', {
    alert_count: items.length,
    items,
    date_sent: new Date().toISOString(),
  });
}
