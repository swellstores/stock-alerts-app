const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export interface SubscribeInput {
  email: string;
  product_id: string;
  variant_id?: string;
  source: string;
}

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

function badRequest(message: string): never {
  throw new SwellError(message, { status: 400 });
}

export function parseSubscribeInput(data: Record<string, any> | null | undefined): SubscribeInput {
  const input = data ?? {};
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) badRequest('A valid email is required');
  if (!isObjectId(input.product_id)) badRequest('A valid product_id is required');

  const variantId = input.variant_id;
  const hasVariant = variantId !== undefined && variantId !== null && variantId !== '';
  if (hasVariant && !isObjectId(variantId)) badRequest('variant_id must be a valid id');

  const source =
    typeof input.source === 'string' && input.source.trim() ? input.source.trim().slice(0, 64) : 'storefront';

  return {
    email,
    product_id: input.product_id,
    ...(hasVariant ? { variant_id: variantId } : {}),
    source,
  };
}
