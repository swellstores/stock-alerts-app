import { alreadyOffPage, cancelledPage, invalidLinkPage, notFoundPage } from './lib/pages';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const config: SwellConfig = {
  description: 'Cancel a back-in-stock subscription from the link in its email',
  route: {
    methods: ['get'],
    public: true,
    cache: { timeout: 0 },
  },
};

interface Subscription {
  id: string;
  status?: string;
  product?: { name?: string } | null;
}

function html(body: string, status: number): SwellResponse {
  return new SwellResponse(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function get(req: SwellRequest) {
  const store = req.store as SwellStore & { name?: string };
  const token = req.query?.token ?? req.data?.token;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    return html(invalidLinkPage(store), 400);
  }

  const page: { results?: Subscription[] } | null = await req.swell.get('/stock-subscriptions', {
    where: { token },
    limit: 1,
    expand: 'product',
  });
  const subscription = page?.results?.[0];
  if (!subscription) {
    return html(notFoundPage(store), 404);
  }

  if (subscription.status !== 'waiting') {
    return html(alreadyOffPage(store), 200);
  }

  await req.swell.put(`/stock-subscriptions/${subscription.id}`, { status: 'cancelled' });
  return html(cancelledPage(store, subscription.product?.name), 200);
}
