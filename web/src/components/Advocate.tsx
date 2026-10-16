import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';

interface Draft { id: string; to: string; subject: string; body: string; status: string }
interface ToolCall { name: string; input: unknown; ok: boolean }
interface Answer {
  answer: string;
  toolCalls: ToolCall[];
  drafts: Draft[];
  citationCheck: { passed: boolean; sentences: number; uncited: string[] };
}
type Msg = { role: 'user'; content: string } | ({ role: 'assistant'; content: string } & Omit<Answer, 'answer'>) | { role: 'error'; content: string };

const SUGGESTIONS = [
  'My heat has been out for 3 days. What can I do?',
  'Is anything in my lease unusual?',
  'Draft a repair request to my landlord about the heat.',
];

const TOOL_LABELS: Record<string, string> = {
  lookup_building: 'checked building record',
  check_building: 'checked building record',
  get_building: 'checked building record',
  search_lease: 'searched lease',
  list_issues: 'read issue log',
  get_issues: 'read issue log',
  draft_letter: 'drafted a letter',
  recall_history: 'recalled your history (SurrealDB)',
  remember_context: 'saved to memory (SurrealDB)',
  draft_message: 'drafted a letter',
};
const toolLabel = (n: string) => TOOL_LABELS[n] ?? n.replace(/_/g, ' ');

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++}>{m[1]}</strong>);
    else out.push(<span key={k++} className="pill cite">{m[2]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Formatted({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) { i++; continue; }
    const ol = /^\s*\d+[.)]\s+/;
    const ul = /^\s*[-*•]\s+/;
    if (ol.test(line) || ul.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i] ?? '')) items.push((lines[i++] ?? '').replace(re, ''));
      const lis = items.map((t, j) => <li key={j}>{inline(t)}</li>);
      blocks.push(ordered ? <ol key={blocks.length}>{lis}</ol> : <ul key={blocks.length}>{lis}</ul>);
    } else {
      const para: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim() && !ol.test(lines[i] ?? '') && !ul.test(lines[i] ?? '')) para.push(lines[i++] ?? '');
      blocks.push(
        <p key={blocks.length}>
          {para.map((t, j) => <Fragment key={j}>{j > 0 && <br />}{inline(t.replace(/^#+\s*/, ''))}</Fragment>)}
        </p>,
      );
    }
  }
  return <>{blocks}</>;
}

function DraftCard({ draft }: { draft: Draft }) {
  const [status, setStatus] = useState(draft.status);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(s: 'approved' | 'discarded') {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ draft: Draft }>(`/api/agent/drafts/${draft.id}`, { method: 'POST', body: JSON.stringify({ status: s }) });
      setStatus(r.draft.status);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
    } catch {
      setErr('Copy failed. Select the text and copy manually.');
    }
  }

  if (status === 'discarded') return <div className="letter muted">Draft discarded.</div>;
  return (
    <div className="letter">
      {status === 'approved' ? (
        <div className="banner approved">
          Approved — copy to send yourself{' '}
          <button className="btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      ) : (
        <div className="banner pending">Pending your approval: nothing is sent</div>
      )}
      <div><strong>To:</strong> {draft.to}</div>
      <div><strong>Subject:</strong> {draft.subject}</div>
      <pre className="body">{draft.body}</pre>
      {err && <p role="alert" className="error">{err}</p>}
      {status !== 'approved' && (
        <div className="row">
          <button className="btn primary big" disabled={busy} onClick={() => void set('approved')}>Approve</button>
          <button className="btn big" disabled={busy} onClick={() => void set('discarded')}>Discard</button>
        </div>
      )}
    </div>
  );
}

function CitationBadge({ c }: { c: Answer['citationCheck'] }) {
  const [open, setOpen] = useState(false);
  if (c.passed || c.uncited.length === 0) return <span className="badge good">✓ All claims cited</span>;
  return (
    <div>
      <button className="badge warn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {c.uncited.length} uncited claim{c.uncited.length === 1 ? '' : 's'} {open ? '▴' : '▾'}
      </button>
      {open && <ul className="uncited">{c.uncited.map((u, i) => <li key={i}>{u}</li>)}</ul>}
    </div>
  );
}

export function Advocate({ address }: { address: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [msgs, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = msgs.filter((m) => m.role !== 'error').map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api<Answer>('/api/agent/ask', {
        method: 'POST',
        body: JSON.stringify({ question, ...(address ? { address } : {}), history }),
      });
      setMsgs((m) => [...m, { role: 'assistant', content: r.answer, toolCalls: r.toolCalls ?? [], drafts: r.drafts ?? [], citationCheck: r.citationCheck }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', content: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel advocate">
      <h2>Ask your advocate</h2>
      <div className="thread" aria-live="polite">
        {msgs.length === 0 && (
          <div className="suggest">
            <p className="muted">Try one of these:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn sug" onClick={() => void ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : m.role === 'error' ? (
            <div key={i} role="alert" className="msg error">{m.content}</div>
          ) : (
            <div key={i} className="msg bot">
              <Formatted text={m.content} />
              {m.toolCalls.length > 0 && (
                <div className="chips">
                  {m.toolCalls.map((t, j) => (
                    <span key={j} className={`chip tool${t.ok ? '' : ' fail'}`}>{toolLabel(t.name)}{t.ok ? '' : ' (failed)'}</span>
                  ))}
                </div>
              )}
              <CitationBadge c={m.citationCheck} />
              {m.drafts.map((d) => <DraftCard key={d.id} draft={d} />)}
            </div>
          ),
        )}
        {busy && <div className="msg bot muted" role="status"><span className="spinner" aria-hidden /> Your advocate is checking the record… this can take up to 40 seconds.</div>}
        <div ref={endRef} />
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
        <input className="grow" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your building, lease, or a problem" aria-label="Question" disabled={busy} />
        <button className="btn primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </section>
  );
}
