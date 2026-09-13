/**
 * Test fixture: a synthetic Seek.co.nz JobMail alert with three jobs, in the
 * HTML shape Seek actually sends (nested tables, tracking query strings on
 * every link, a logo link and a "View job" link per card that point at the
 * same job id, boilerplate header/footer) plus the text/plain alternative.
 *
 * Synthetic: job ids, companies and copy are invented. No real listing.
 */

export const SEEK_ALERT_JOB_IDS = ['84120987', '84131244', '84099311'] as const;

const TRACK = 'type=standard&ref=jobmail&tracking=JM-ALERT-2f8c1&utm_source=jobmail&utm_medium=email';

export const SEEK_ALERT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>3 new Head of Modern Workplace jobs in Auckland</title>
  <style>
    body { font-family: Arial, sans-serif; }
    .card { border: 1px solid #ddd; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="padding:16px">
        <a href="https://www.seek.co.nz/?${TRACK}&amp;cid=logo"><img src="https://cdn.seek.co.nz/logo.png" alt="SEEK" width="80"></a>
      </td></tr>
      <tr><td style="padding:0 16px">
        <p>Hi Matt,</p>
        <p><strong>3 new jobs</strong> match your JobMail alert <em>&quot;Head of&quot; in Auckland</em>.</p>
      </td></tr>

      <!-- job card 1 -->
      <tr><td class="card" style="padding:16px">
        <table role="presentation" width="100%">
          <tr>
            <td width="56"><a href="https://www.seek.co.nz/job/84120987?${TRACK}&amp;pos=1&amp;cid=logo"><img src="https://cdn.seek.co.nz/kiwi-energy.png" alt="" width="48"></a></td>
            <td>
              <h3 style="margin:0"><a href="https://www.seek.co.nz/job/84120987?${TRACK}&amp;pos=1" style="color:#0d3880">Head of Modern Workplace</a></h3>
              <div>Kiwi Energy Group</div>
              <div>Auckland CBD, Auckland</div>
              <div>$180,000 &ndash; $200,000 per year + KiwiSaver</div>
              <ul>
                <li>Own the Microsoft 365, Intune and Windows 365 roadmap for 3,000+ staff</li>
                <li>Lead a team of 8 across endpoint, identity and collaboration</li>
                <li>Hybrid &mdash; 3 days in our Auckland office</li>
              </ul>
              <p><a href="https://www.seek.co.nz/job/84120987?${TRACK}&amp;pos=1&amp;cid=viewjob">View job</a> &nbsp;|&nbsp; Posted 2d ago</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- job card 2 -->
      <tr><td class="card" style="padding:16px">
        <table role="presentation" width="100%">
          <tr>
            <td width="56"><a href="https://www.seek.co.nz/job/84131244?${TRACK}&amp;pos=2&amp;cid=logo"><img src="https://cdn.seek.co.nz/harbour.png" alt="" width="48"></a></td>
            <td>
              <h3 style="margin:0"><a href="https://www.seek.co.nz/job/84131244?${TRACK}&amp;pos=2" style="color:#0d3880">Head of Digital Workplace &amp; AI Enablement</a></h3>
              <div>Harbour Health Alliance</div>
              <div>North Shore, Auckland</div>
              <div>Competitive salary + health insurance</div>
              <ul>
                <li>Bring Copilot and Copilot Studio agents into production with Responsible AI governance</li>
                <li>Partner with Security on Zero Trust and privileged access</li>
              </ul>
              <p><a href="https://www.seek.co.nz/job/84131244?${TRACK}&amp;pos=2&amp;cid=viewjob">View job</a> &nbsp;|&nbsp; Posted 4d ago</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- job card 3 -->
      <tr><td class="card" style="padding:16px">
        <table role="presentation" width="100%">
          <tr>
            <td width="56"><a href="https://www.seek.co.nz/job/84099311?${TRACK}&amp;pos=3&amp;cid=logo"><img src="https://cdn.seek.co.nz/southern.png" alt="" width="48"></a></td>
            <td>
              <h3 style="margin:0"><a href="https://www.seek.co.nz/job/84099311?${TRACK}&amp;pos=3" style="color:#0d3880">Technology Manager &#8211; End User Computing</a></h3>
              <div>Southern Cross Logistics</div>
              <div>Remote</div>
              <div>$150k - $170k pa</div>
              <ul>
                <li>Fully remote role leading Intune, Entra and device security for a national fleet</li>
                <li>Budget ownership (OPEX/CAPEX) and licensing optimisation</li>
              </ul>
              <p><a href="https://www.seek.co.nz/job/84099311?${TRACK}&amp;pos=3&amp;cid=viewjob">View job</a> &nbsp;|&nbsp; Posted 6d ago</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px;font-size:12px;color:#666">
        <p><a href="https://www.seek.co.nz/jobmail/manage?${TRACK}">Manage your JobMail alerts</a> &nbsp;|&nbsp; <a href="https://www.seek.co.nz/jobmail/unsubscribe?id=abc&amp;${TRACK}">Unsubscribe</a></p>
        <p>You are receiving this email because you signed up for JobMail alerts on seek.co.nz.</p>
        <p><a href="https://www.seek.co.nz/privacy">Privacy policy</a> &middot; <a href="https://www.seek.co.nz/terms">Terms of use</a></p>
        <p>&copy; 2026 SEEK Limited. SEEK, Level 6, 1 Queen Street, Auckland 1010.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
<script type="text/javascript">window.__track = "should never appear in output";</script>
</body>
</html>`;

export const SEEK_ALERT_TEXT = `Hi Matt,

3 new jobs match your JobMail alert "Head of" in Auckland.

Head of Modern Workplace
Kiwi Energy Group
Auckland CBD, Auckland
$180,000 – $200,000 per year + KiwiSaver
- Own the Microsoft 365, Intune and Windows 365 roadmap for 3,000+ staff
- Lead a team of 8 across endpoint, identity and collaboration
- Hybrid — 3 days in our Auckland office
Posted 2d ago
View job: https://www.seek.co.nz/job/84120987?${TRACK}&pos=1

Head of Digital Workplace & AI Enablement
Harbour Health Alliance
North Shore, Auckland
Competitive salary + health insurance
- Bring Copilot and Copilot Studio agents into production with Responsible AI governance
- Partner with Security on Zero Trust and privileged access
Posted 4d ago
View job: https://www.seek.co.nz/job/84131244?${TRACK}&pos=2

Technology Manager – End User Computing
Southern Cross Logistics
Remote
$150k - $170k pa
- Fully remote role leading Intune, Entra and device security for a national fleet
- Budget ownership (OPEX/CAPEX) and licensing optimisation
Posted 6d ago
View job: https://www.seek.co.nz/job/84099311?${TRACK}&pos=3

Manage your JobMail alerts: https://www.seek.co.nz/jobmail/manage?${TRACK}
Unsubscribe: https://www.seek.co.nz/jobmail/unsubscribe?id=abc&${TRACK}

You are receiving this email because you signed up for JobMail alerts on seek.co.nz.
Privacy policy: https://www.seek.co.nz/privacy
Terms of use: https://www.seek.co.nz/terms
© 2026 SEEK Limited. SEEK, Level 6, 1 Queen Street, Auckland 1010.
`;

/** A footer-only email: nothing to extract. */
export const SEEK_BOILERPLATE_ONLY_HTML = `<html><body>
<p>You are receiving this email because you signed up for JobMail alerts on seek.co.nz.</p>
<p><a href="https://www.seek.co.nz/jobmail/manage?${TRACK}">Manage your JobMail alerts</a> | <a href="https://www.seek.co.nz/jobmail/unsubscribe?id=abc">Unsubscribe</a></p>
<p><a href="https://www.seek.co.nz/privacy">Privacy policy</a> · <a href="https://www.seek.co.nz/terms">Terms of use</a></p>
<p>© 2026 SEEK Limited. SEEK, Level 6, 1 Queen Street, Auckland 1010.</p>
</body></html>`;
