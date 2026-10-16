import { useState } from 'react';
import type { Draft } from './types';

const today = () =>
  new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function Letter({
  draft,
  onDecide,
  compact,
}: {
  draft: Draft;
  onDecide: (id: string, status: 'approved' | 'discarded') => Promise<void>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const decide = async (status: 'approved' | 'discarded') => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(draft.id, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the draft. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const fullText = `${today()}\n\nTo: ${draft.to}\nRe: ${draft.subject}\n\n${draft.body}`;
  const discarded = draft.status === 'discarded';

  return (
    <div className={`letter-wrap ${compact ? 'is-compact' : ''} ${discarded ? 'is-discarded' : ''}`}>
      <div className={`approval approval-${draft.status}`} role="status">
        {draft.status === 'approved' ? (
          <>
            <span className="approval-text">Approved. Copy and send it yourself.</span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void copyText(fullText).then((ok) => setCopied(ok))}
            >
              {copied ? 'Copied' : 'Copy letter'}
            </button>
          </>
        ) : discarded ? (
          <span className="approval-text">Discarded. Nothing was sent.</span>
        ) : (
          <>
            <span className="approval-text">Draft, pending your approval. Nothing is sent.</span>
            <span className="approval-actions">
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void decide('discarded')}>
                Discard
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide('approved')}>
                Approve
              </button>
            </span>
          </>
        )}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!discarded && (
        <article className="letter" aria-label={`Letter: ${draft.subject}`}>
          <p className="letter-date">{today()}</p>
          <p className="letter-to">To: {draft.to}</p>
          <p className="letter-re">Re: {draft.subject}</p>
          <div className="letter-body">
            {draft.body.split(/\n{2,}/).map((para, i) => (
              <p key={i}>
                {para.split('\n').map((ln, j, arr) => (
                  <span key={j}>
                    {ln}
                    {j < arr.length - 1 && <br />}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
