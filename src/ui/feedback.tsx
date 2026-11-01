// Send feedback: a message, an optional email for a reply and, if ticked, the app version and browser, posted to the
// site's Cloudflare Pages Function (functions/api/feedback.ts). Nothing from the tracker is attached.
import { useState } from 'preact/hooks';
import { track } from '../analytics.ts';
import { openModal } from './hooks.tsx';

const MAX_MESSAGE = 4000;

/** The endpoint next to the app (app/ → ../api/feedback); null in the single-file build, which has no site. */
export const FEEDBACK_URL = import.meta.env.MODE === 'single' ? null : '../api/feedback';

export function openFeedback(version: string) {
  openModal((close) => <FeedbackForm version={version} close={close} />, { size: 'activity' });
}

type Status = 'editing' | 'sending' | 'sent' | 'failed';

function FeedbackForm({ version, close }: { version: string; close: () => void }) {
  const [status, setStatus] = useState<Status>('editing');
  const [withDevice, setWithDevice] = useState(true);
  const device = `${version} · ${navigator.userAgent}`;

  if (!FEEDBACK_URL) {
    return (
      <div class="dialog-body">
        <h2 class="dialog-title">Send feedback</h2>
        <p class="dialog-text">This offline file cannot send messages. Open the online version of the app to send feedback.</p>
      </div>
    );
  }
  if (status === 'sent') {
    return (
      <div class="dialog-body">
        <h2 class="dialog-title">Thank you</h2>
        <p class="dialog-text">Your message is on its way. Every one of them is read.</p>
        <div class="dialog-actions"><button class="primary" onClick={close}>Close</button></div>
      </div>
    );
  }

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const message = String(form.get('message')).trim();
    if (!message) return;
    setStatus('sending');
    try {
      const res = await fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message, email: String(form.get('email')).trim(), website: String(form.get('website')),
          ...(withDevice ? { version, browser: navigator.userAgent } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      track('feedback');
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <form class="dialog-body feedback" onSubmit={onSubmit}>
      <h2 class="dialog-title">Send feedback</h2>
      <p class="dialog-text">A bug, a missing feature, or just that you use it: all of it helps decide what comes next.</p>
      <textarea name="message" rows={6} maxLength={MAX_MESSAGE} required aria-label="Your message" placeholder="Your message" />
      <input type="email" name="email" maxLength={200} aria-label="Email" placeholder="Email, only if you want a reply" />
      {/* Honeypot: hidden from people, filled in by spam bots. */}
      <input type="text" name="website" class="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label class="toggle">
        <input type="checkbox" checked={withDevice} onChange={(e) => setWithDevice(e.currentTarget.checked)} />
        <span class="toggle-text"><span>Include the app version and browser</span><span class="muted small">{device}</span></span>
      </label>
      {status === 'failed' && <p class="notice">It could not be sent just now. Your text is still here, try again in a moment.</p>}
      <div class="dialog-actions">
        <button type="button" class="secondary" onClick={close}>Cancel</button>
        <button type="submit" class="primary" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send'}</button>
      </div>
    </form>
  );
}
