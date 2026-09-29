<div style="background:#f5f5f5;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#222222;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;padding:32px 24px;">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;">{{ alert_count }} products are running low</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;line-height:22px;">
      <tr>
        <th style="padding:6px 0;text-align:left;color:#555555;font-weight:normal;border-bottom:1px solid #e5e5e5;">Product</th>
        <th style="padding:6px 0;text-align:right;color:#555555;font-weight:normal;border-bottom:1px solid #e5e5e5;">Stock</th>
        <th style="padding:6px 0;text-align:right;color:#555555;font-weight:normal;border-bottom:1px solid #e5e5e5;">Threshold</th>
      </tr>
      {% for item in items %}
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;"><a href="{{ store.admin_url }}/admin/products/{{ item.product_id }}" style="color:#222222;">{{ item.product_name }}</a></td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;border-bottom:1px solid #f0f0f0;">{{ item.stock_level }}</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #f0f0f0;">{{ item.threshold }}</td>
      </tr>
      {% endfor %}
    </table>
  </div>
  <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:13px;line-height:20px;color:#888888;">{{ store.name }}</p>
</div>
