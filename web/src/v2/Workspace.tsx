import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Brief } from './Brief';
import { Letter } from './Letter';
import { BuildingPanel, IssuesPanel, LeasePanel, LettersPanel } from './Panels';
import {
  errMsg,
  type AskResponse,
  type BuildingRecord,
  type Draft,
  type Issue,
  type IssueCategory,
  type LeaseRecord,
  type Message,
  type PanelKey,
  type ToolCall,
} from './types';
import './v2.css';

const ADDR_KEY = 'ta.address';
const SUGGESTIONS = [
  'My heat has been out for 3 days. What can I do?',
  'Is anything in my lease unusual?',
  'Draft a repair request to my landlord about the heat.',
];
const ASK_ABOUT: Partial<Record<PanelKey, string>> = {
  building: "What do my building's records tell me?",
  lease: 'Is anything in my lease unusual?',
  issues: 'What should I do next about my open issues?',
};
const THINKING = ['Checking building records…', 'Reading your lease…', 'Reviewing your issue log…', 'Writing your answer…'];

const TOOL_PANEL: Record<string, PanelKey | 'memory'> = {
  get_building_record: 'building',
  get_lease_terms: 'lease',
  search_lease: 'lease',
  list_issues: 'issues',
  draft_letter: 'letters',
  recall_history: 'memory',
  remember_context: 'memory',
};
const TOOL_LABEL: Record<string, string> = {
  get_building_record: 'building record',
  get_lease_terms: 'your lease',
  search_lease: 'your lease',
  list_issues: 'your issue log',
  get_nyc_rule: 'NYC rules',
  draft_letter: 'letter draft',
  recall_history: 'memory',
  remember_context: 'memory',
};

function readAddr(): string {
  try {
    return localStorage.getItem(ADDR_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeAddr(a: string) {
  try {
    localStorage.setItem(ADDR_KEY, a);
  } catch {
    /* storage unavailable; keep in memory */
  }
}

let seq = 0;
const nid = () => `m${Date.now()}-${seq++}`;

export function Workspace() {
  const { user, signOut } = useAuth();

  const [address, setAddress] = useState(readAddr);
  const [building, setBuilding] = useState<BuildingRecord | null>(null);
  const [buildingLoading, setBuildingLoading] = useState(false);
  const [buildingError, setBuildingError] = useState<string | null>(null);

  const [lease, setLease] = useState<LeaseRecord | null>(null);
  const [leaseBusy, setLeaseBusy] = useState(false);
  const [leaseError, setLeaseError] = useState<string | null>(null);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const [pulse, setPulse] = useState<Set<PanelKey | 'memory'>>(new Set());
  const [memoryUsed, setMemoryUsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const openChat = (q?: string) => {
    setChatOpen(true);
    if (q) setPrefill((p) => ({ text: q, n: (p?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!chatOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setChatOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen]);

  /* ---------- data loading ---------- */

  useEffect(() => {
    if (!address) {
      setBuilding(null);
      return;
    }
    let live = true;
    setBuildingLoading(true);
    setBuildingError(null);
    api<BuildingRecord>(`/api/building?address=${encodeURIComponent(address)}`)
      .then((r) => live && setBuilding(r))
      .catch((e: unknown) => {
        if (!live) return;
        setBuilding(null);
        setBuildingError(`We couldn't find that building. ${errMsg(e)} Check the street number and borough.`);
      })
      .finally(() => live && setBuildingLoading(false));
    return () => {
      live = false;
    };
  }, [address]);

  useEffect(() => {
    api<LeaseRecord>('/api/lease')
      .then(setLease)
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 404)) setLeaseError(errMsg(e));
      });
  }, []);

  const loadIssues = useCallback(() => {
    api<{ issues: Issue[] }>('/api/issues')
      .then((r) => {
        setIssues(r.issues);
        setIssuesError(null);
      })
      .catch((e: unknown) => setIssuesError(`Couldn't load your issue log. ${errMsg(e)}`));
  }, []);
  useEffect(loadIssues, [loadIssues]);

  /* ---------- actions ---------- */

  const changeAddress = (a: string) => {
    writeAddr(a);
    setAddress(a);
  };

  const uploadLease = async (file: File) => {
    setLeaseBusy(true);
    setLeaseError(null);
    try {
      const res = await fetch('/api/lease/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Upload failed (${res.status}).`);
      }
      setLease((await res.json()) as LeaseRecord);
    } catch (e) {
      setLeaseError(`We couldn't read that lease. ${errMsg(e)}`);
    } finally {
      setLeaseBusy(false);
    }
  };

  const pasteLease = async (text: string) => {
    setLeaseBusy(true);
    setLeaseError(null);
    try {
      setLease(await api<LeaseRecord>('/api/lease/text', { method: 'POST', body: JSON.stringify({ text }) }));
    } catch (e) {
      setLeaseError(`We couldn't read that text. ${errMsg(e)}`);
    } finally {
      setLeaseBusy(false);
    }
  };

  const addIssue = async (i: { category: IssueCategory; description: string; startedOn: string; landlordNotified: boolean }) => {
    const r = await api<{ issue: Issue }>('/api/issues', { method: 'POST', body: JSON.stringify(i) });
    setIssues((list) => [r.issue, ...list]);
  };
  const resolveIssue = async (id: string) => {
    try {
      const r = await api<{ issue: Issue }>(`/api/issues/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      });
      setIssues((list) => list.map((x) => (x.id === id ? r.issue : x)));
    } catch (e) {
      setIssuesError(`Couldn't update that issue. ${errMsg(e)}`);
    }
  };

  const decideDraft = async (id: string, status: 'approved' | 'discarded') => {
    const r = await api<{ draft: Draft }>(`/api/agent/drafts/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...r.draft } : d)));
  };

  const pulseTimer = useRef<number | undefined>(undefined);
  const firePulse = (calls: ToolCall[]) => {
    const keys = new Set<PanelKey | 'memory'>();
    for (const c of calls) {
      const k = TOOL_PANEL[c.name];
      if (k) keys.add(k);
    }
    setMemoryUsed(keys.has('memory'));
    setPulse(keys);
    window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulse(new Set()), 6000);
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || asking) return;
    const history = messages
      .filter((m) => !m.error)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { id: nid(), role: 'user', content: q }]);
    setAsking(true);
    try {
      const r = await api<AskResponse>('/api/agent/ask', {
        method: 'POST',
        body: JSON.stringify({ question: q, address: address || undefined, history }),
      });
      const newDrafts = r.drafts ?? [];
      if (newDrafts.length) {
        setDrafts((list) => {
          const ids = new Set(newDrafts.map((d) => d.id));
          return [...list.filter((d) => !ids.has(d.id)), ...newDrafts];
        });
      }
      setMessages((m) => [
        ...m,
        {
          id: nid(),
          role: 'assistant',
          content: r.answer,
          toolCalls: r.toolCalls ?? [],
          draftIds: newDrafts.map((d) => d.id),
          citationCheck: r.citationCheck,
        },
      ]);
      firePulse(r.toolCalls ?? []);
      loadIssues();
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: nid(), role: 'assistant', error: true, content: `The answer didn't come through. ${errMsg(e)} Try asking again.` },
      ]);
    } finally {
      setAsking(false);
    }
  };

  /* ---------- panels ---------- */

  const renderPanel = (k: PanelKey) => {
    switch (k) {
      case 'building':
        return (
          <BuildingPanel
            key="building"
            address={address}
            onAddress={changeAddress}
            record={building}
            loading={buildingLoading}
            error={buildingError}
            pulsed={pulse.has('building')}
          />
        );
      case 'lease':
        return (
          <LeasePanel
            key="lease"
            lease={lease}
            busy={leaseBusy}
            error={leaseError}
            pulsed={pulse.has('lease')}
            onUploadFile={(f) => void uploadLease(f)}
            onPasteText={(t) => void pasteLease(t)}
          />
        );
      case 'issues':
        return (
          <IssuesPanel
            key="issues"
            issues={issues}
            error={issuesError}
            pulsed={pulse.has('issues')}
            onAdd={addIssue}
            onResolve={resolveIssue}
          />
        );
      case 'letters':
        return <LettersPanel key="letters" drafts={drafts} pulsed={pulse.has('letters')} onDecide={decideDraft} />;
    }
  };

  return (
    <div className="ws">
      <header className="masthead">
        <div className="brand">
          <span className="wordmark">Tenant Advocate</span>
          <span className="tagline">for New York City renters</span>
        </div>
        <div className="who">
          <span>{user?.name ?? user?.email}</span>
          <button type="button" className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dash" aria-label="Your case">
        <div className="dash-top">
          <h1 className="dash-title">{building?.building.label || 'Your case'}</h1>
          <span className={`memory ${memoryUsed ? 'is-on' : ''} ${pulse.has('memory') ? 'is-pulsed' : ''}`} title="Remembers context between conversations">
            <span className="memory-dot" aria-hidden="true" />
            {memoryUsed ? 'Memory used in last answer' : 'Memory'}
          </span>
        </div>
        <div className="dash-grid">
          {(['building', 'lease', 'issues', 'letters'] as PanelKey[]).map((k) => (
            <div key={k} className={`tile tile-${k}`}>
              {renderPanel(k)}
              {ASK_ABOUT[k] && (
                <button type="button" className="link ask-about" onClick={() => openChat(ASK_ABOUT[k])}>
                  Ask about this
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

      {!chatOpen && (
        <button type="button" className="launcher" onClick={() => openChat()} aria-expanded={false}>
          <span className="launcher-dot" aria-hidden="true" />
          Ask your advocate
        </button>
      )}
      {chatOpen && (
        <section className="chat chat-pop" role="dialog" aria-label="Ask your advocate">
          <header className="chat-pop-head">
            <h2>Ask your advocate</h2>
            <button type="button" className="link" onClick={() => setChatOpen(false)} aria-label="Minimize chat">
              Minimize
            </button>
          </header>
          <Thread messages={messages} drafts={drafts} asking={asking} onAsk={(q) => void ask(q)} onDecide={decideDraft} />
          <Composer
            disabled={asking}
            leaseBusy={leaseBusy}
            onSend={(q) => void ask(q)}
            onFile={(f) => void uploadLease(f)}
            prefill={prefill}
          />
        </section>
      )}
    </div>
  );
}

/* ---------------- Thread ---------------- */

function Thread({
  messages,
  drafts,
  asking,
  onAsk,
  onDecide,
}: {
  messages: Message[];
  drafts: Draft[];
  asking: boolean;
  onAsk: (q: string) => void;
  onDecide: (id: string, status: 'approved' | 'discarded') => Promise<void>;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, asking]);

  return (
    <div className="thread" aria-live="polite">
      {messages.length === 0 && (
        <div className="empty">
          <p className="empty-intro">
            Tell me what's wrong in your apartment. I'll check the city's records, your lease and your log, and show you
            where each answer comes from.
          </p>
          <ul className="suggest" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button type="button" className="suggestion" onClick={() => onAsk(s)} disabled={asking}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="turn turn-user">
            <span className="speaker">You asked</span>
            <p className="question">{m.content}</p>
          </div>
        ) : (
          <div key={m.id} className={`turn turn-agent ${m.error ? 'is-error' : ''}`}>
            {m.error ? <p className="inline-error">{m.content}</p> : <Answer m={m} drafts={drafts} onDecide={onDecide} />}
          </div>
        ),
      )}

      {asking && <Thinking />}
      <div ref={end} />
    </div>
  );
}

function Answer({
  m,
  drafts,
  onDecide,
}: {
  m: Message;
  drafts: Draft[];
  onDecide: (id: string, status: 'approved' | 'discarded') => Promise<void>;
}) {
  const used = [...new Set((m.toolCalls ?? []).map((c) => TOOL_LABEL[c.name] ?? c.name.replace(/_/g, ' ')))];
  const cc = m.citationCheck;
  const myDrafts = (m.draftIds ?? []).map((id) => drafts.find((d) => d.id === id)).filter((d): d is Draft => !!d);
  return (
    <>
      <Brief text={m.content} />
      {myDrafts.length > 0 && (
        <p className="draft-toast" role="status">
          Draft added to Letters for your approval
        </p>
      )}
      {myDrafts.map((d) => (
        <Letter key={d.id} draft={d} onDecide={onDecide} />
      ))}
      <div className="answer-meta">
        {used.length > 0 && <span className="checked">Checked: {used.join(' · ')}</span>}
        {cc &&
          (cc.uncited.length === 0 ? (
            <span className="cc cc-ok">All claims cited</span>
          ) : (
            <details className="cc cc-warn">
              <summary>
                {cc.uncited.length} {cc.uncited.length === 1 ? 'claim' : 'claims'} uncited
              </summary>
              <ul>
                {cc.uncited.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          ))}
      </div>
    </>
  );
}

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => Math.min(n + 1, THINKING.length - 1)), 5000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="thinking" role="status">
      <span className="thinking-bar" aria-hidden="true" />
      <span key={i} className="thinking-text">
        {THINKING[i]}
      </span>
    </div>
  );
}

/* ---------------- Composer ---------------- */

function Composer({
  disabled,
  leaseBusy,
  onSend,
  onFile,
  prefill,
}: {
  disabled: boolean;
  leaseBusy: boolean;
  onSend: (q: string) => void;
  onFile: (f: File) => void;
  prefill?: { text: string; n: number } | null;
}) {
  const [text, setText] = useState(prefill?.text ?? '');
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (prefill) setText(prefill.text);
    taRef.current?.focus();
  }, [prefill]);
  const send = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  return (
    <div className="composer-wrap">
      {leaseBusy && <p className="progress-line composer-note">Reading your lease in an isolated sandbox…</p>}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="clip" title="Attach your lease (PDF)">
          <span className="sr-only">Attach your lease as a PDF</span>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M16.5 6.5 8.4 14.6a2 2 0 0 0 2.8 2.8l8.1-8.1a4 4 0 0 0-5.7-5.7L5.5 11.7a6 6 0 0 0 8.5 8.5l6.5-6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={leaseBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
        <label htmlFor="ask" className="sr-only">
          Ask about your apartment
        </label>
        <textarea
          id="ask"
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Describe what's happening, or ask about your lease…"
        />
        <button type="submit" className="btn btn-primary send" disabled={disabled || !text.trim()}>
          {disabled ? 'Working…' : 'Ask'}
        </button>
      </form>
      <p className="footnote">Information only, not legal advice · This app never contacts your landlord.</p>
    </div>
  );
}
