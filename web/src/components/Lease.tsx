import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';

interface Term { value: string | number | null; quote?: string; page?: number; verified?: boolean }
interface Flag { issue: string; quote: string; page: number; why: string; checkWith?: string | null; verified?: boolean }
interface LeaseData {
  terms: Record<string, unknown> & { fees?: Term[]; otherNotableClauses?: Term[]; redFlags?: Flag[] };
  uploadedAt: string;
}

const LABELS: Record<string, string> = {
  monthlyRent: 'Monthly rent',
  securityDeposit: 'Security deposit',
  leaseStart: 'Lease start',
  leaseEnd: 'Lease end',
  renewal: 'Renewal',
  repairsAndMaintenance: 'Repairs & maintenance',
  subletting: 'Subletting',
  earlyTermination: 'Early termination',
  heatAndHotWater: 'Heat & hot water',
};

function Row({ label, t }: { label: string; t: Term }) {
  return (
    <tr>
      <td className="tl">{label}</td>
      <td>
        {String(t.value ?? '—')}
        {t.quote && <div className="quote">“{t.quote}”</div>}
      </td>
      <td className="pg">
        {t.page ?? '—'} {t.verified && <span className="ok" title="Quote verified in document">✓</span>}
      </td>
    </tr>
  );
}

export function Lease() {
  const [lease, setLease] = useState<LeaseData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<LeaseData>('/api/lease')
      .then(setLease)
      .catch((e: Error) => {
        if (!(e instanceof ApiError && e.status === 404)) setError(e.message);
      });
  }, []);

  async function run(p: Promise<LeaseData>) {
    setBusy(true);
    setError(null);
    try {
      setLease(await p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function upload(f: File) {
    void run(
      (async () => {
        const res = await fetch('/api/lease/upload', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/pdf' },
          body: f,
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? res.statusText);
        }
        return (await res.json()) as LeaseData;
      })(),
    );
  }

  const terms = lease?.terms;
  return (
    <section className="panel">
      <h2>Your lease</h2>
      {busy ? (
        <p className="progress" role="status">
          <span className="spinner" aria-hidden /> Parsing in an isolated Daytona sandbox… this can take up to a minute.
        </p>
      ) : (
        <>
          <div className="row">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <button className="link" onClick={() => setPaste(!paste)}>
              {paste ? 'Use PDF instead' : 'Paste text instead'}
            </button>
          </div>
          {paste && (
            <div className="stack">
              <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste lease text" />
              <button
                className="btn primary"
                disabled={!text.trim()}
                onClick={() => void run(api<LeaseData>('/api/lease/text', { method: 'POST', body: JSON.stringify({ text }) }))}
              >
                Analyze text
              </button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {terms && (
        <>
          {!!terms.redFlags?.length && (
            <div className="flags">
              <h3>Worth checking</h3>
              {terms.redFlags.map((f, i) => (
                <div key={i} className="flag">
                  <strong>{f.issue}</strong> <span className="muted small">p. {f.page}</span>{' '}
                  {f.verified && <span className="ok">✓</span>}
                  <div className="quote">“{f.quote}”</div>
                  <div>{f.why}</div>
                  {f.checkWith && <div className="muted small">Confirm with: {f.checkWith}</div>}
                </div>
              ))}
            </div>
          )}
          <table className="terms">
            <thead>
              <tr><th>Term</th><th>Value</th><th>Page</th></tr>
            </thead>
            <tbody>
              {Object.entries(LABELS).map(([k, label]) => {
                const t = terms[k] as Term | undefined;
                return t ? <Row key={k} label={label} t={t} /> : null;
              })}
              {terms.fees?.map((t, i) => <Row key={`f${i}`} label="Fee" t={t} />)}
              {terms.otherNotableClauses?.map((t, i) => <Row key={`o${i}`} label="Other clause" t={t} />)}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
