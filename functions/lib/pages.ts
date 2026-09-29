export interface PageStore {
  name?: string;
  url?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(store: PageStore, message: string): string {
  const name = store.name ? escapeHtml(store.name) : '';
  const link = store.url
    ? `<p style="margin:24px 0 0;font-size:15px;"><a href="${escapeHtml(store.url)}" style="color:#222222;">Back to ${name || 'the store'}</a></p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name || 'Stock alert'}</title>
</head>
<body style="margin:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#222222;">
<div style="max-width:480px;margin:48px auto;background:#ffffff;border-radius:6px;padding:32px 24px;text-align:center;">
${name ? `<p style="margin:0 0 16px;font-size:13px;color:#888888;">${name}</p>` : ''}
<p style="margin:0;font-size:18px;line-height:26px;">${message}</p>
${link}
</div>
</body>
</html>`;
}

export function invalidLinkPage(store: PageStore): string {
  return page(store, 'This link is not valid.');
}

export function notFoundPage(store: PageStore): string {
  return page(store, 'This link is not valid or has already been used.');
}

export function cancelledPage(store: PageStore, productName?: string): string {
  return page(store, `You won&#39;t be emailed about ${productName ? escapeHtml(productName) : 'this product'}.`);
}

export function alreadyOffPage(store: PageStore): string {
  return page(store, 'This alert is already switched off.');
}
