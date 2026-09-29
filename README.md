# Stock Alerts for Swell

## What the app does

Lets customers ask to be emailed when a sold-out product is back, and tells the store's team
when a product is running low. Customers leave their email address in a form on the product
page; the moment the product, or the exact variant they wanted, is restocked, each of them
gets one email with the product's image, price and a link back to it. Store admins get one
email when a product's stock drops to its low-stock threshold, and can opt in to a daily
summary of everything still running low. Everything runs on Swell's own product data and
notifications: there is no third-party service, account or credential to set up.

## Features

### Back-in-stock emails for customers

**What it does.** A form on the storefront sends the customer's email address and the
product (and variant, if one is selected) to the app. The app saves a subscription with the
status *Waiting*. When the product's stock goes from 0 or less to above 0, every waiting
subscription for it is marked *Notified* and each customer gets one email: subject
"{{ product.name }} is back in stock", an intro text the merchant can edit, the product
image, the price and a button to the product page.

- **Exact variant.** With **Match subscriptions to the exact variant** on, a subscription
  made for a variant is notified only when that variant is restocked, and a subscription
  without a variant when the product is. With it off, a product coming back in stock (total
  stock from 0 or less to above 0) notifies every subscriber to it, whatever variant they
  chose; a restock of a single variant while the product's total is already above 0 still
  notifies only that variant's subscribers.
- **One email per subscription, ever.** A customer who subscribes again after being
  notified gets a new subscription, and so a new email on the next restock.
- **Already in stock.** If the product or variant is in stock when the form is submitted,
  or the product doesn't track stock, nothing is saved and the app answers
  `{ "subscribed": false, "in_stock": true }` so the storefront can say so.
- **No duplicates.** A second submission for the same email, product and variant while the
  first is still waiting returns the existing subscription (`"existing": true`).
- **Switched off.** While **Send back-in-stock emails** is off, restocks email nobody and
  subscriptions stay waiting until the next restock after it's switched back on. New
  subscriptions are still saved. An admin who sets a subscription to *Notified* by hand
  always emails that customer.

It shows up under **Products › Stock alerts**, with *All*, *Waiting*, *Notified* and
*Cancelled* tabs. An admin can cancel a waiting subscription. Once a subscription is notified
its status is locked; its other fields stay editable and it can be deleted.
Each product's edit page gets a **Stock alerts** tab listing that product's subscriptions.

**How it's built.** `functions/subscribe.ts` is a public `POST` route that validates the
input (`functions/lib/validate.ts`) and writes to the app's `stock-subscriptions`
collection (`models/stock-subscriptions.json`, `content/stock-subscriptions.json`).
`functions/stock-changed.ts` runs on `product.stock_adjusted`; `functions/lib/stock-rules.ts`
decides which product and variant were restocked, and `functions/lib/subscriptions.ts`
finds waiting subscriptions and sets them to `notified` in batches. The email is the
`back-in-stock` notification (`notifications/back-in-stock.json`, `.tpl`), sent when a
subscription is updated to `notified`, never repeated.

### Low-stock alerts for admins

**What it does.** Each product has a threshold: its own **Low-stock threshold** if it's set
above 0, otherwise the app's **Default low-stock threshold** (5 unless changed). When the
product's total stock across all its variants crosses from above the threshold to at or
below it, the app opens a low-stock alert and store admins get one email: subject "Low
stock: {{ product.name }}", with the stock level, the threshold and a link to the product in
the dashboard.

- **One alert per drop.** Further sales while stock is already at or below the threshold
  don't alert again. A product that goes from 0 to 3 with a threshold of 5 doesn't alert
  either, because stock never crossed from above it.
- **Resolves itself.** When stock goes back above the threshold, the open alert is marked
  *Resolved*. The next drop opens a new one.

It shows up under **Products › Low stock alerts**, with *Open* and *Resolved* tabs. The
per-product threshold is on the **Stock alerts** tab of each product's edit page.

**How it's built.** The same `functions/stock-changed.ts` handler, using the
`low_stock_threshold` app field on products (`models/products.json`,
`content/products.json`) or the app setting of the same name. Alerts are records in the
app's `low-stock-alerts` collection (`models/low-stock-alerts.json`,
`content/low-stock-alerts.json`). The email is the `low-stock` notification
(`notifications/low-stock.json`, `.tpl`), sent to admins when an alert is created.

### Daily low-stock digest

**What it does.** Off by default. When **Daily low-stock digest** is on, every day at 08:00
UTC admins get one summary email listing every open low-stock alert with the product's stock
level and threshold. On a day with no open alerts nothing is sent.

**How it's built.** `functions/digest.ts`, a daily cron (`0 8 * * *`), writes one record to
the app's `low-stock-digests` collection (`models/low-stock-digests.json`); the
`low-stock-digest` notification (`notifications/low-stock-digest.json`, `.tpl`) emails
admins when it's created.

## Setup

### Install and configure

1. Install **Stock Alerts** from the Swell App Store.
2. Open the app's settings and check the options below. The defaults send back-in-stock
   emails and low-stock alerts straight away.
3. Optionally set a **Low-stock threshold** on individual products (the product's **Stock
   alerts** tab).
4. Add the back-in-stock form to your storefront's product page (next section).
5. Review the three emails (**Back in stock**, **Low stock alert** and **Low stock
   digest**) in the store's notification settings. The back-in-stock intro text is editable
   there.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Send back-in-stock emails (`back_in_stock_enabled`) | On | Email waiting customers when a product is restocked. While off, new subscriptions are still saved but restocks email nobody. |
| Match subscriptions to the exact variant (`notify_variant_level`) | On | A subscription for a variant is notified only when that variant is restocked. Off: a product coming back in stock (total from 0 or less to above 0) notifies every subscriber to it, whatever variant they chose; a restock of a single variant while the product's total is already above 0 still notifies only that variant's subscribers. |
| Alert admins on low stock (`low_stock_enabled`) | On | Open an alert and email admins when a product's stock drops to or below its threshold. |
| Default low-stock threshold (`low_stock_threshold`) | 5 | Used for any product without its own **Low-stock threshold** above 0. |
| Daily low-stock digest (`low_stock_digest_enabled`) | Off | One summary email to admins at 08:00 UTC listing every open low-stock alert. |

### Adding the form to your storefront

Swell apps can't add code to a storefront, so paste this into your theme's product template
where the form should appear. Show it only when the product, or the selected variant, is out
of stock. Replace `your-store` with your store ID and `pk_...` with your store's public key
(Developer › API keys), and set `data-product-id` to the product's ID from your theme. For
products with variants, set `data-variant-id` to the selected variant's ID whenever the
shopper picks an option, or leave it empty to subscribe to the product as a whole.

```html
<form id="stock-alert-form" data-product-id="PRODUCT_ID" data-variant-id="">
  <input type="email" name="email" placeholder="Your email address" required>
  <button type="submit">Email me when it's back</button>
  <p id="stock-alert-message"></p>
</form>
<script>
  (() => {
    const STORE_ID = 'your-store';
    const PUBLIC_KEY = 'pk_...'; // your public key
    const form = document.getElementById('stock-alert-form');
    const message = document.getElementById('stock-alert-message');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = {
        email: form.elements.email.value,
        product_id: form.dataset.productId,
        source: 'storefront',
      };
      if (form.dataset.variantId) body.variant_id = form.dataset.variantId;

      try {
        const res = await fetch(`https://${STORE_ID}.swell.store/functions/stock_alerts/subscribe`, {
          method: 'POST',
          headers: { Authorization: PUBLIC_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.subscribed) message.textContent = "Thanks, we'll email you when it's back in stock.";
        else if (data.in_stock) message.textContent = 'Good news, this is in stock now.';
        else message.textContent = data.error || 'Something went wrong. Please try again.';
      } catch {
        message.textContent = 'Something went wrong. Please try again.';
      }
    });
  })();
</script>
```

The same request works from any framework or headless storefront:

- `POST https://<store-id>.swell.store/functions/stock_alerts/subscribe`
- Headers: `Authorization: <public key>` and `Content-Type: application/json`. The public
  key is required even though the route is public: Swell uses it to pick the store
  environment and find the app.
- JSON body: `email`, `product_id`, and optionally `variant_id` and `source` (a short label
  saved on the subscription, `storefront` if omitted). Send everything in the body; query
  parameters are dropped when there is a body.

| Response | Meaning |
| --- | --- |
| `200 { "subscribed": true, "id": "…", "existing": false }` | Subscription saved. |
| `200 { "subscribed": true, "id": "…", "existing": true }` | This email was already waiting for this product and variant. |
| `200 { "subscribed": false, "in_stock": true }` | In stock now, or the product doesn't track stock. Nothing saved. |
| `400 { "error": "A valid email is required" }` | Invalid input; other messages cover `product_id` and `variant_id`. |
| `404 { "error": "Product not found" }` or `{ "error": "Variant not found" }` | No such product, or the variant doesn't belong to it. |

## Day-to-day use

- **Nothing to do for normal traffic.** Customers subscribe from the product page and are
  emailed when stock comes back; admins are emailed when stock runs low.
- **Seeing who is waiting.** **Products › Stock alerts** lists every subscription, and the
  **Stock alerts** tab on a product lists that product's. The *Waiting* tab shows demand for
  products that are out of stock.
- **Removing a subscription.** Open it and set the status to *Cancelled*, or delete it. Once
  a subscription is notified only its status is locked; its other fields stay editable and
  the record can still be deleted.
- **Emailing someone by hand.** Setting a waiting subscription to *Notified* sends the
  back-in-stock email straight away, even while **Send back-in-stock emails** is off.
- **Working through low stock.** **Products › Low stock alerts** › *Open* is the list to
  reorder from. Alerts move to *Resolved* on their own once stock is back above the
  threshold.
- **Pausing customer emails.** Switch off **Send back-in-stock emails**. Subscriptions keep
  arriving and stay waiting; the first restock after it's switched back on notifies them.

## Limits and known issues

- **Low stock is product-level only.** For a product with variants, the threshold is compared
  against the product's total stock across all its variants, not against any single variant,
  so a single size or colour running low doesn't alert on its own.
- **At most 500 customers are notified per restock.** The rest stay waiting for the next
  restock, and a warning is logged.
- **The digest lists at most 500 open alerts.**
- **One email per subscription record.** A notified subscription is never emailed again.
- **Duplicate alerts are possible.** Two stock changes to the same product at the same
  instant could each open an alert, because checking for an open alert and creating one is
  not a single step.
- **Products must have stock tracking turned on.** A product without it never gets
  subscriptions or alerts.
- **The subscribe route is public.** Anyone with the store's public key, which is visible in
  the storefront, can subscribe any email address. Each subscription sends at most one
  email, but there is no rate limiting in this version.
- **Emails use Swell's notification system** and the store's sender settings. Notifications
  sent from a non-live environment get "(TEST)" added to the start of the subject.
- **Permissions are full access (`[]`).** The platform rejects `req.swell.settings()` for
  apps with scoped permissions unless extra grants are added. The app only reads products
  and variants and writes to its own collections.

## Development

The repository is the source of truth. `.swellrc` is committed on purpose: it pins the app to
its official record on the Swell Apps account, so a clone pushes to the same app. Never
commit a `.swellrc` created against another store.

```bash
npm install
npm run typecheck
npm test
```

The unit tests run with Vitest and make no network calls, but the Vitest config loads Swell
CLI auth, so run `swell login` first or set the `SWELL_STORE_ID` and `SWELL_SESSION_ID`
environment variables.

Push to Swell Apps and check that everything registered:

```bash
swell switch swell-apps
swell app push
swell inspect functions --app=.
swell inspect models --app=.
swell inspect content --app=.
swell inspect notifications --app=.
swell inspect settings --app=.
```

`swell logs` isn't available for the test environment. Read the app's logs through the API
instead, using the app ObjectId (the id in `.swellrc`):

```bash
swell api get '/:logs?where[app_id]=<app ObjectId>'
```

To run the digest without waiting for 08:00 UTC, switch on **Daily low-stock digest**, find
the function's id and call it:

```bash
swell inspect functions app.stock_alerts.digest
swell api put '/:functions/<function id>' --body '{"$call":{}}'
```

`assets/icon.png` and `assets/screenshots/01-cover.png` are solid-colour placeholders.
Marketing replaces them before release. The icon is picked up by its filename, so keep it
at `assets/icon.png`, 512×512, with square corners.

## Contributing

Issues and pull requests are welcome at
[github.com/swellstores/stock-alerts-app](https://github.com/swellstores/stock-alerts-app).
For questions, visit the [Swell Discord](https://discord.gg/VakSbyjDGZ) or
[GitHub discussions](https://github.com/orgs/swellstores/discussions/).

## License

MIT. See [LICENSE.md](LICENSE.md).
