import Link from 'next/link';
import { getEnv } from '@/server/db';
import { PRIVACY_VERSION_LABEL, privacyContact } from '@/server/privacy';
import styles from './privacy.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy statement · ApplyForMe' };

/**
 * Privacy statement (Matt, 2026-11-25; NZ Privacy Act 2020: IPP3 collection notice, IPP3A information from
 * other sources, IPP12 overseas disclosure). It resolves NO identity and shows nothing about anyone, so a
 * person can read it before accepting; like every path it is still behind Cloudflare Access (policy unchanged).
 *
 * Version: server/privacy.ts PRIVACY_VERSION. Change it whenever this statement changes in a way that matters,
 * and everyone is asked to accept again. Keep it true to the code: the inventory is the D1 schema
 * (server/db/schema.ts), server/account-data.ts (which lists every item to the user) and the external calls
 * (server/ai/anthropic.ts, server/fetch/apify.ts, server/pipeline/inbound-handler.ts, server/email/send.ts).
 */
export default function PrivacyPage() {
  const contact = privacyContact(getEnv());
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Privacy statement</h1>
      <p className={styles.meta}>ApplyForMe · version {PRIVACY_VERSION_LABEL}</p>
      <p>
        ApplyForMe reads the job alerts you forward to it, decides which jobs are worth your time, writes a tailored CV and cover letter for each with AI, and emails you the pack
        to review. It is run from New Zealand by its owner, who is also its privacy officer (contact below). This statement explains what personal information the app collects,
        why, where it is kept, who sees it, how long it is kept, and your rights under the Privacy Act 2020.
      </p>

      <h2>What we collect from you</h2>
      <ul>
        <li>
          <b>Your account:</b> the email address you sign in with through Cloudflare Access, a name (at first, the part of your email before the @), the review email your packs go
          to if you set one, whether sending is paused, and when you accepted this statement.
        </li>
        <li>
          <b>Your master profile (your CV):</b> your name, email, phone, address, LinkedIn link, nationality or work rights, years of experience, executive summary, skills, your
          full career history (employers, job titles, locations, dates and achievements), certifications and training, the benefits that matter to you, and your salary target.
        </li>
        <li>
          <b>How you want it done:</b> your job rules (keywords, preferred and excluded companies, locations, salary floor, minimum match), and your tailoring preferences: notes on
          tone and emphasis, and whole CVs or cover letters you add as examples.
        </li>
        <li>
          <b>What you tell it about each job:</b> job links you paste, the buttons you press in the review email or the app (applied, not for me, regenerate, thumbs up), any reason
          you type, and whether you submitted an application.
        </li>
        <li>
          <b>Your own Anthropic key</b>, if you choose to add one. It is encrypted and never shown back.
        </li>
      </ul>
      <p className={styles.callout}>
        CVs, cover letters and the example documents you add hold a lot of personal information: contact details, your whole work history and often your salary expectations. If
        they mention other people, such as referees or former managers, only include what those people would expect you to share for a job application.
      </p>

      <h2>Information we get from other places</h2>
      <p>Some information reaches us from somewhere other than you:</p>
      <ul>
        <li>
          <b>Job-alert emails</b> from Seek and LinkedIn that you forward (for example with a Gmail filter) to the app&rsquo;s jobs address. We read each job in them (title,
          company, location, salary and link) and keep a copy of the email.
        </li>
        <li>
          <b>Job ads</b>, fetched from Seek, LinkedIn or the link you paste. An ad can name a hiring manager or recruiter and give their contact details. We hold that only as part
          of the ad, use it only for your application and your records, and do not look anyone up elsewhere: the app does no research on hiring managers or other people.
        </li>
        <li>
          <b>Cloudflare Access</b> tells us the email address you signed in with.
        </li>
      </ul>
      <p>Salary bands used for scoring are built-in market figures, not information about any person.</p>

      <h2>What the app works out and makes</h2>
      <p>
        For each job: a match score with the evidence behind it, the decision whether to tailor, the tailored summary, highlights and cover letter, the CV and letter as Word files,
        and the review email sent to you.
      </p>

      <h2>Why we collect it</h2>
      <ul>
        <li>To find jobs that suit you and write a tailored CV and cover letter for each, in your voice, using only facts from your profile.</li>
        <li>To send you each pack, keep your documents so you can download them again, and track what you applied for.</li>
        <li>To learn from your responses so later packs fit better.</li>
        <li>To run the service: sign you in, avoid processing an alert twice, fix problems and keep AI costs in check.</li>
      </ul>
      <p>
        An email address is needed to have an account. Everything else is up to you: with less, the app has less to work with. We do not sell your information, use it for
        advertising, or use it to train AI models. The app never applies for a job or contacts an employer for you; you decide and apply yourself.
      </p>

      <h2>Who sees it</h2>
      <ul>
        <li>You. Other people who use the app cannot see anything about you.</li>
        <li>The owner, who runs the service and can see stored information to support it and fix problems.</li>
        <li>The services below, each only for its part of the job.</li>
      </ul>

      <h2>Where it is kept and who processes it</h2>
      <p>These services are outside New Zealand, so your information is stored and processed overseas. Each acts for us to provide the app:</p>
      <ul>
        <li>
          <b>Cloudflare</b> (United States, with servers worldwide) runs the app, its database and file storage (your profile, jobs, documents and the alert emails), its sign-in
          (Cloudflare Access), receiving the alert emails, sending your review emails, and the app&rsquo;s service logs.
        </li>
        <li>
          <b>Anthropic</b> (United States) writes the tailored text. For each job it is sent your name, years of experience, summary, skills, career history and certifications,
          your tailoring notes and example documents, and the job ad. It is not sent your phone, address or salary target. If you add your own key, your Anthropic account is used.
          Anthropic&rsquo;s API terms say it does not train its models on this data.
        </li>
        <li>
          <b>Apify</b> (Czech Republic), when turned on, fetches job pages that Seek and LinkedIn will not serve to the app directly. It is sent only the job page&rsquo;s address,
          never your profile.
        </li>
        <li>
          <b>Seek, LinkedIn</b> and the site of any link you paste receive the app&rsquo;s request for the job page. Your review emails go to the inbox you choose, so its provider
          (for example Google, if it is a Gmail address) holds them too.
        </li>
      </ul>

      <h2>Email</h2>
      <p>
        The app sends email only to you, at your review address: one email per tailored job with the CV and cover letter attached, and test emails you ask for. It never emails
        employers, recruiters or anyone else.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your information while you have an account; nothing is deleted on a timer. Under <b>See and correct my data</b> you can remove a job (with its ad, documents and your
        responses), a preference or your key at any time. If you delete your account, everything about you is deleted at once, including your documents. Cloudflare&rsquo;s database
        recovery history and its short-lived service logs can hold deleted information for up to 30 days before it is gone for good.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see the personal information we hold about you, ask us to correct it, or ask us to delete it. In Settings, <b>See and correct my data</b> shows everything we
        hold about you and why, and lets you change or remove most of it there and then; <b>Delete my account</b> deletes your account and everything saved with it. For anything
        else, email <a href={`mailto:${contact}`}>{contact}</a>. We will reply within 20 working days.
      </p>
      <p>
        If you are not happy with how we handle your information, tell us first. You can also complain to the{' '}
        <a href="https://www.privacy.org.nz" target="_blank" rel="noopener noreferrer">
          Office of the Privacy Commissioner
        </a>{' '}
        (0800 803 909).
      </p>

      <h2>Security and breaches</h2>
      <p>
        Your information travels encrypted, sign-in goes through Cloudflare Access, and your Anthropic key is encrypted in the database. If a privacy breach is likely to cause you
        serious harm, we will tell you and the Privacy Commissioner as soon as practicable.
      </p>

      <h2>Changes</h2>
      <p>If this statement changes in a way that matters, you will be asked to read and accept it again before you continue.</p>

      <div className={styles.links}>
        <Link href="/privacy/accept">Accept page</Link>
        <Link href="/settings">Back to the app</Link>
      </div>
    </main>
  );
}
