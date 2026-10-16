import { useState, type FormEvent, type ReactNode } from 'react';
import { Letter } from './Letter';
import {
  CATEGORY_LABEL,
  dayCount,
  termText,
  type BuildingRecord,
  type Draft,
  type Issue,
  type IssueCategory,
  type LeaseRecord,
  type Term,
} from './types';

export function Panel({
  id,
  title,
  pulsed,
  aside,
  children,
}: {
  id: string;
  title: string;
  pulsed: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${pulsed ? 'is-pulsed' : ''}`} aria-labelledby={`${id}-h`}>
      <header className="panel-head">
        <h2 id={`${id}-h`}>{title}</h2>
        {pulsed && <span className="used-tag">Used in this answer</span>}
        {aside}
      </header>
      {children}
    </section>
  );
}

/* ---------------- Building ---------------- */

export function BuildingPanel({
  address,
  onAddress,
  record,
  loading,
  error,
  pulsed,
}: {
  address: string;
  onAddress: (a: string) => void;
  record: BuildingRecord | null;
  loading: boolean;
  error: string | null;
  pulsed: boolean;
}) {
  const [editing, setEditing] = useState(!address);
  const [draft, setDraft] = useState(address);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const a = draft.trim();
    if (!a) return;
    onAddress(a);
    setEditing(false);
  };

  return (
    <Panel id="building" title="Building" pulsed={pulsed}>
      {editing ? (
        <form className="addr-form" onSubmit={submit}>
          <label htmlFor="addr-input">Your building address</label>
          <div className="addr-row">
            <input
              id="addr-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. 520 W 145th St, Manhattan"
              autoComplete="street-address"
            />
            <button className="btn btn-primary" type="submit">
              Look up
            </button>
          </div>
          <p className="hint">Checked against HPD public records. Sent with every question you ask.</p>
        </form>
      ) : (
        <div className="addr-line">
          <span className="addr-text">{record?.building.label ?? address}</span>
          <button
            type="button"
            className="link"
            onClick={() => {
              setDraft(address);
              setEditing(true);
            }}
          >
            Change
          </button>
        </div>
      )}

      {loading && <p className="progress-line">Checking HPD records…</p>}
      {error && !loading && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}

      {record && !loading && (
        <>
          <dl className="stats">
            <Stat n={record.violations.openTotal} label="Open violations" />
            <Stat n={record.violations.openByClass.C ?? 0} label="Class C, immediately hazardous" tone="serious" />
            <Stat n={record.complaints.heatHotWaterLast12Months} label="Heat and hot water complaints, 12 mo" />
            <Stat n={record.violations.rentImpairingOpen} label="Rent-impairing, open" tone="check" />
          </dl>
          <p className="caption">Complaints are reports, not findings.</p>
          {record.notes.length > 0 && (
            <ul className="notes">
              {record.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <details className="disclose">
            <summary>View records</summary>
            {record.violations.recentOpen.length > 0 && (
              <>
                <h3 className="sub">Recent open violations</h3>
                <ul className="records">
                  {record.violations.recentOpen.map((v) => (
                    <li key={v.violationid}>
                      <span className={`cls cls-${v.class}`}>Class {v.class}</span>
                      <span className="rec-date">{v.inspectiondate?.slice(0, 10)}</span>
                      <span className="rec-desc">{v.novdescription}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {record.complaints.recent.length > 0 && (
              <>
                <h3 className="sub">Recent complaints</h3>
                <ul className="records">
                  {record.complaints.recent.map((c) => (
                    <li key={c.complaint_id}>
                      <span className="rec-date">{c.received_date?.slice(0, 10)}</span>
                      <span className="rec-desc">
                        {[c.major_category, c.minor_category].filter(Boolean).join(', ')}
                        {c.complaint_status ? ` (${c.complaint_status.toLowerCase()})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="sub">Sources</h3>
            <ul className="sources">
              {record.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Panel>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'serious' | 'check' }) {
  const t = n > 0 && tone ? `tone-${tone}` : '';
  return (
    <div className={`stat ${t}`}>
      <dt>{label}</dt>
      <dd>{n}</dd>
    </div>
  );
}

/* ---------------- Lease ---------------- */

const KEY_TERMS: [keyof LeaseRecord['terms'], string][] = [
  ['monthlyRent', 'Monthly rent'],
  ['securityDeposit', 'Security deposit'],
  ['renewal', 'Renewal'],
  ['heatAndHotWater', 'Heat and hot water'],
  ['repairsAndMaintenance', 'Repairs'],
  ['subletting', 'Subletting'],
  ['earlyTermination', 'Early termination'],
];

function TermRow({ label, term }: { label: string; term: Term | undefined }) {
  const text = termText(term);
  if (!term?.quote) {
    return (
      <div className="term">
        <span className="term-label">{label}</span>
        <span className="term-value">{text}</span>
      </div>
    );
  }
  return (
    <details className="term term-x">
      <summary>
        <span className="term-label">{label}</span>
        <span className="term-value">{text}</span>
      </summary>
      <blockquote>
        {term.quote}
        <footer>
          {term.page ? `Page ${term.page}` : 'Your lease'}
          {term.verified ? ', quote verified in the PDF' : ''}
        </footer>
      </blockquote>
    </details>
  );
}

export function LeasePanel({
  lease,
  busy,
  error,
  pulsed,
  onUploadFile,
  onPasteText,
}: {
  lease: LeaseRecord | null;
  busy: boolean;
  error: string | null;
  pulsed: boolean;
  onUploadFile: (f: File) => void;
  onPasteText: (t: string) => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [allFlags, setAllFlags] = useState(false);
  const [text, setText] = useState('');
  const t = lease?.terms;
  const term = t?.leaseStart || t?.leaseEnd ? `${termText(t?.leaseStart)} to ${termText(t?.leaseEnd)}` : null;

  const uploader = (
    <div className="lease-upload">
      <label className="btn btn-outline file-btn">
        {lease ? 'Replace lease PDF' : 'Upload lease PDF'}
        <input
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadFile(f);
            e.target.value = '';
          }}
        />
      </label>
      <button type="button" className="link" onClick={() => setPasting((p) => !p)} disabled={busy}>
        {pasting ? 'Cancel' : 'Paste text instead'}
      </button>
    </div>
  );

  return (
    <Panel id="lease" title="Lease" pulsed={pulsed}>
      {busy ? (
        <p className="progress-line">Reading your lease in an isolated sandbox… this takes about 30 seconds.</p>
      ) : (
        !lease && <p className="hint">Upload your lease and every answer can quote it, with page numbers.</p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}

      {t && !busy && (
        <>
          <div className="terms">
            {term && (
              <div className="term">
                <span className="term-label">Term</span>
                <span className="term-value">{term}</span>
              </div>
            )}
            {KEY_TERMS.map(([k, label]) => (
              <TermRow key={k} label={label} term={t[k] as Term | undefined} />
            ))}
          </div>

          {t.redFlags && t.redFlags.length > 0 && (
            <div className="flags">
              <h3 className="sub sub-check">Worth checking</h3>
              <ul>
                {(allFlags ? t.redFlags : t.redFlags.slice(0, 3)).map((f, i) => (
                  <li key={i} className="flag">
                    <p className="flag-issue">{f.issue}</p>
                    {f.why && <p className="flag-why">{f.why}</p>}
                    {f.quote && (
                      <details className="disclose disclose-small">
                        <summary>Clause{f.page ? `, page ${f.page}` : ''}</summary>
                        <blockquote>{f.quote}</blockquote>
                      </details>
                    )}
                    {f.checkWith && <p className="flag-confirm">Confirm with: {f.checkWith}</p>}
                  </li>
                ))}
              </ul>
              {t.redFlags.length > 3 && (
                <button type="button" className="link" onClick={() => setAllFlags((v) => !v)}>
                  {allFlags ? 'Show fewer' : `Show all ${t.redFlags.length}`}
                </button>
              )}
            </div>
          )}

          {((t.fees?.length ?? 0) > 0 || (t.otherNotableClauses?.length ?? 0) > 0) && (
            <details className="disclose">
              <summary>Fees and other clauses</summary>
              <div className="terms">
                {(t.fees ?? []).map((f, i) => (
                  <TermRow key={`f${i}`} label={f.label ?? f.name ?? 'Fee'} term={f} />
                ))}
                {(t.otherNotableClauses ?? []).map((f, i) => (
                  <TermRow key={`o${i}`} label={f.label ?? f.name ?? 'Clause'} term={f} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {!busy && uploader}
      {pasting && !busy && (
        <form
          className="paste-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length < 40) return;
            onPasteText(text);
            setPasting(false);
            setText('');
          }}
        >
          <label htmlFor="lease-text">Lease text</label>
          <textarea id="lease-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={text.trim().length < 40}>
            Read this lease
          </button>
        </form>
      )}
    </Panel>
  );
}

/* ---------------- Issues ---------------- */

const CATS = Object.keys(CATEGORY_LABEL) as IssueCategory[];
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function IssuesPanel({
  issues,
  error,
  pulsed,
  onAdd,
  onResolve,
}: {
  issues: Issue[];
  error: string | null;
  pulsed: boolean;
  onAdd: (i: { category: IssueCategory; description: string; startedOn: string; landlordNotified: boolean }) => Promise<void>;
  onResolve: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<IssueCategory>('heat');
  const [description, setDescription] = useState('');
  const [startedOn, setStartedOn] = useState(isoToday());
  const [notified, setNotified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const open = issues.filter((i) => i.status !== 'resolved');
  const resolved = issues.filter((i) => i.status === 'resolved');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return setFormError('Describe the problem in a few words.');
    setSaving(true);
    setFormError(null);
    try {
      await onAdd({ category, description: description.trim(), startedOn, landlordNotified: notified });
      setDescription('');
      setNotified(false);
      setAdding(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      id="issues"
      title="Issues"
      pulsed={pulsed}
      aside={
        <button type="button" className="link head-link" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          {adding ? 'Cancel' : 'Log a problem'}
        </button>
      }
    >
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <form className="issue-form" onSubmit={(e) => void submit(e)}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="iss-cat">Problem</label>
              <select id="iss-cat" value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="iss-date">Started on</label>
              <input id="iss-date" type="date" value={startedOn} max={isoToday()} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="iss-desc">What is happening</label>
            <textarea id="iss-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={notified} onChange={(e) => setNotified(e.target.checked)} />
            I have already told my landlord
          </label>
          {formError && (
            <p className="inline-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save to log'}
          </button>
        </form>
      )}

      {open.length === 0 && !adding ? (
        <p className="hint">No open problems. Logging dates now makes any complaint stronger later.</p>
      ) : (
        <ul className="issues">
          {open.map((i) => (
            <li key={i.id} className="issue">
              <span className="day">
                <span className="day-word">Day</span>
                <span className="day-n">{dayCount(i.startedOn)}</span>
              </span>
              <span className="issue-main">
                <span className="issue-cat">{CATEGORY_LABEL[i.category] ?? i.category}</span>
                <span className="issue-desc">{i.description}</span>
                <span className="issue-meta">
                  Since {i.startedOn.slice(0, 10)}.{' '}
                  {i.landlordNotified
                    ? `Landlord told${i.notifiedOn ? ` ${i.notifiedOn.slice(0, 10)}` : ''}.`
                    : 'Landlord not told yet.'}
                </span>
              </span>
              <button type="button" className="link" onClick={() => void onResolve(i.id)} aria-label={`Mark ${CATEGORY_LABEL[i.category]} issue resolved`}>
                Resolved
              </button>
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details className="disclose disclose-small">
          <summary>{resolved.length} resolved</summary>
          <ul className="issues issues-done">
            {resolved.map((i) => (
              <li key={i.id} className="issue">
                <span className="issue-main">
                  <span className="issue-cat">{CATEGORY_LABEL[i.category] ?? i.category}</span>
                  <span className="issue-desc">{i.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

/* ---------------- Letters ---------------- */

export function LettersPanel({
  drafts,
  pulsed,
  onDecide,
}: {
  drafts: Draft[];
  pulsed: boolean;
  onDecide: (id: string, status: 'approved' | 'discarded') => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = drafts.filter((d) => d.status !== 'discarded');
  return (
    <Panel id="letters" title="Letters" pulsed={pulsed}>
      {visible.length === 0 ? (
        <p className="hint">Ask for a letter and the draft appears here for your approval. Nothing is sent.</p>
      ) : (
        <ul className="letters">
          {[...visible].reverse().map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="letter-row"
                aria-expanded={openId === d.id}
                onClick={() => setOpenId((o) => (o === d.id ? null : d.id))}
              >
                <span className="letter-subj">{d.subject}</span>
                <span className={`status status-${d.status}`}>{d.status === 'approved' ? 'Approved' : 'Pending approval'}</span>
              </button>
              {openId === d.id && <Letter draft={d} onDecide={onDecide} compact />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
