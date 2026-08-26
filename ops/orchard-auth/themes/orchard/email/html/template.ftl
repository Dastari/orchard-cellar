<#macro emailLayout>
<!doctype html>
<html lang="${locale.language}" dir="${(ltr)?then('ltr','rtl')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body, table, td, p, a { font-family: Verdana, Arial, sans-serif; }
    .orchard-content p { color: #5b3d22; font-size: 17px; line-height: 1.6; margin: 0 0 20px; }
    .orchard-content a { background: #3c9147; border: 3px solid #22662e; box-shadow: inset 0 0 0 2px #77b65f; color: #fff5d5 !important; display: inline-block; font-size: 17px; font-weight: bold; padding: 13px 22px; text-decoration: none; }
    .orchard-content .orchard-note { color: #7a5738; font-size: 14px; line-height: 1.55; }
    @media only screen and (max-width: 620px) {
      .orchard-shell { width: 100% !important; }
      .orchard-panel { padding: 28px 22px !important; }
      .orchard-title { font-size: 22px !important; }
    }
  </style>
</head>
<body style="background-color:#498849; margin:0; padding:0; width:100%;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#498849;">
    <tr>
      <td align="center" style="padding:38px 14px;">
        <table class="orchard-shell" role="presentation" border="0" cellpadding="0" cellspacing="0" width="580" style="border-collapse:separate; width:580px;">
          <tr>
            <td align="center" style="background-color:#b96f4f; border:5px solid #5b3028; border-bottom:0; padding:11px 18px 9px;">
              <div class="orchard-title" style="color:#fff0cb; font-size:26px; font-weight:bold; letter-spacing:1px; line-height:1.25; text-shadow:2px 2px 0 #713c2e;">ORCHARD &amp; CELLAR</div>
            </td>
          </tr>
          <tr>
            <td class="orchard-panel" style="background-color:#f3d2a5; border:5px solid #5b3028; box-shadow:inset 0 0 0 3px #d89b68; padding:38px 44px 32px;">
              <div class="orchard-content">
                <#nested>
              </div>
              <div style="border-top:2px solid #c58d62; color:#91672e; font-size:13px; line-height:1.5; margin-top:28px; padding-top:18px; text-align:center;">
                A message from Orchard &amp; Cellar<br>
                Keep this message private to protect your account.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
</#macro>
