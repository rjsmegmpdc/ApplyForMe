import { redirect } from 'next/navigation';

/** The console lives under /runs, /profile, … — the root just forwards to the inbox. */
export default function Home() {
  redirect('/runs');
}
