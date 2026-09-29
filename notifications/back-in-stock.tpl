<div style="background:#f5f5f5;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#222222;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;padding:32px 24px;">
    <p style="margin:0 0 24px;font-size:16px;line-height:24px;">{{ content.intro }}</p>
    {% if product.images[0].file.url %}
    <img src="{{ product.images[0].file.url }}" alt="{{ product.name }}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border-radius:4px;margin:0 0 24px;">
    {% endif %}
    <h1 style="margin:0 0 8px;font-size:22px;line-height:30px;">{{ product.name }}</h1>
    {% if variant.name %}
    <p style="margin:0 0 8px;font-size:15px;line-height:22px;color:#555555;">{{ variant.name }}</p>
    {% endif %}
    <p style="margin:0 0 24px;font-size:18px;line-height:26px;font-weight:bold;">
      {% if variant.price %}{{ variant.price | currency }}{% else %}{{ product.price | currency }}{% endif %}
    </p>
    <a href="{{ store.url }}/products/{{ product.slug }}" style="display:inline-block;background:#222222;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:4px;">Shop now</a>
  </div>
  <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:13px;line-height:20px;color:#888888;">{{ store.name }}</p>
  {% if unsubscribe_url %}
  <p style="max-width:560px;margin:8px auto 0;text-align:center;font-size:13px;line-height:20px;color:#888888;">Don't want this alert? <a href="{{ unsubscribe_url }}" style="color:#888888;">Cancel it</a>.</p>
  {% endif %}
</div>
