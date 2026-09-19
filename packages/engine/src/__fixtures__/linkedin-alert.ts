/** Synthetic LinkedIn job-alert email (HTML) with two jobs, tracked links, and Gmail forward wrapper. */
export const LINKEDIN_ALERT_HTML = `
<html><body>
<p>---------- Forwarded message ---------<br>From: LinkedIn Job Alerts &lt;jobalerts-noreply@linkedin.com&gt;<br>Date: Fri, 19 Sep 2026<br>Subject: Head of Technology Architecture at Auckland Council<br>To: &lt;smharkness.nz@gmail.com&gt;</p>
<table><tr><td>
<h2>Your job alert for Head of Technology</h2>
<p>2 new jobs match your preferences.</p>
<table><tr><td>
  <a href="https://www.linkedin.com/comm/jobs/view/4123456789/?trackingId=abc123&amp;refId=xyz&amp;trk=eml-email_job_alert"><img src="logo.png" alt=""></a>
  <a href="https://www.linkedin.com/comm/jobs/view/4123456789/?trackingId=abc123&amp;refId=xyz&amp;trk=eml-email_job_alert-job_title"><strong>Head of Technology Architecture</strong></a>
  <p>Auckland Council · Auckland, New Zealand</p>
  <p>Lead enterprise and solution architecture across council digital services, governing standards and roadmaps.</p>
  <p>Actively recruiting · 12 applicants</p>
  <p>2d ago</p>
</td></tr>
<tr><td>
  <a href="https://www.linkedin.com/comm/jobs/view/4987654321/?trackingId=def456&amp;trk=eml-email_job_alert-job_title"><strong>Head of Modern Workplace</strong></a>
  <p>Spark New Zealand</p>
  <p>Wellington, New Zealand</p>
  <p>Own the M365, Intune and endpoint strategy for 6,000 staff.</p>
  <p>Easy Apply</p>
</td></tr></table>
<p><a href="https://www.linkedin.com/comm/jobs/search/?trk=eml-email_job_alert-see_all">See all jobs</a></p>
<p>You are receiving job alert emails. <a href="https://www.linkedin.com/comm/psettings/">Unsubscribe</a> · © 2026 LinkedIn Corporation</p>
</td></tr></table>
</body></html>`;

export const LINKEDIN_ALERT_TEXT = `---------- Forwarded message ---------
From: LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>
Subject: Head of Technology Architecture at Auckland Council

Your job alert for Head of Technology
2 new jobs match your preferences.

Head of Technology Architecture
https://www.linkedin.com/comm/jobs/view/4123456789/?trackingId=abc123
Auckland Council · Auckland, New Zealand
Lead enterprise and solution architecture across council digital services.
2d ago

Head of Modern Workplace
https://www.linkedin.com/comm/jobs/view/4987654321/?trackingId=def456
Spark New Zealand
Wellington, New Zealand
Own the M365, Intune and endpoint strategy for 6,000 staff.

See all jobs https://www.linkedin.com/comm/jobs/search/
Unsubscribe https://www.linkedin.com/comm/psettings/
`;
