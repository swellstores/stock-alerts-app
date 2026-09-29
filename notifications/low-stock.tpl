<div style="background:#f5f5f5;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#222222;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;padding:32px 24px;">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;">{{ product.name }} is running low</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;line-height:22px;margin:0 0 24px;">
      {% if product.sku %}
      <tr>
        <td style="padding:6px 0;color:#555555;">SKU</td>
        <td style="padding:6px 0;text-align:right;">{{ product.sku }}</td>
      </tr>
      {% endif %}
      <tr>
        <td style="padding:6px 0;color:#555555;">Current stock</td>
        <td style="padding:6px 0;text-align:right;font-weight:bold;">{{ stock_level }}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555555;">Low-stock threshold</td>
        <td style="padding:6px 0;text-align:right;">{{ threshold }}</td>
      </tr>
    </table>
    <a href="{{ store.admin_url }}/admin/products/{{ product.id }}" style="display:inline-block;background:#222222;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 24px;border-radius:4px;">View product</a>
  </div>
  <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:13px;line-height:20px;color:#888888;">{{ store.name }}</p>
</div>
