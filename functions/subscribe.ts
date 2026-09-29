import { findWaiting } from './lib/subscriptions';
import { parseSubscribeInput } from './lib/validate';

export const config: SwellConfig = {
  description: 'Subscribe an email to a back-in-stock alert for a product or variant',
  route: {
    methods: ['post'],
    public: true,
  },
};

async function getRecord(swell: SwellAPI, url: string, fields: string): Promise<Record<string, any> | null> {
  try {
    return await swell.get(url, { fields });
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

export async function post(req: SwellRequest) {
  const input = parseSubscribeInput(req.data);

  const product = await getRecord(
    req.swell,
    `/products/${input.product_id}`,
    'id,name,active,stock_tracking,stock_level',
  );
  if (!product?.id || product.active === false) {
    throw new SwellError('Product not found', { status: 404 });
  }

  let level = product.stock_level;
  if (input.variant_id) {
    const variant = await getRecord(req.swell, `/products:variants/${input.variant_id}`, 'id,parent_id,stock_level');
    if (!variant?.id || variant.parent_id !== input.product_id) {
      throw new SwellError('Variant not found', { status: 404 });
    }
    level = variant.stock_level;
  }

  if (product.stock_tracking !== true || level > 0) {
    return { subscribed: false, in_stock: true };
  }

  const existing = await findWaiting(req.swell, input);
  if (existing) {
    return { subscribed: true, id: existing.id, existing: true };
  }

  const created: { id: string } = await req.swell.post('/stock-subscriptions', {
    email: input.email,
    product_id: input.product_id,
    ...(input.variant_id ? { variant_id: input.variant_id } : {}),
    source: input.source,
    status: 'waiting',
  });
  return { subscribed: true, id: created.id, existing: false };
}
