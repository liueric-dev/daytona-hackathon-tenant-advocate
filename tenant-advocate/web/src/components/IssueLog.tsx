import { useEffect, useState } from 'react';
import { api } from '../api';

interface Issue {
  id: string;
  category: string;
  description: string;
  startedOn: string;
  landlordNotified: boolean;
  notifiedOn?: string;
  status: 'open' | 'resolved';
}
const CATS = ['heat', 'hot_water', 'pests', 'leak', 'mold', 'repairs', 'fees', 'rent', 'other'];
const today = () => new Date().toISOString().slice(0, 10);

function dayNum(startedOn: string) {
  const [y = 0, m = 1, d = 1] = startedOn.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d);
  const now = new Date();
  const t = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((t - start) / 86400000) + 1);
}

export function IssueLog() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [category, setCategory] = useState('heat');
  const [startedOn, setStartedOn] = useState(today());
  const [description, setDescription] = useState('');
  const [notified, setNotified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ issues: Issue[] }>('/api/issues')
      .then((r) => setIssues(r.issues))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ issue: Issue }>('/api/issues', {
        method: 'POST',
        body: JSON.stringify({
          category,
          description,
          startedOn,
          landlordNotified: notified,
          ...(notified ? { notifiedOn: today() } : {}),
        }),
      });
      setIssues((x) => [r.issue, ...x]);
      setDescription('');
      setNotified(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function resolve(id: string) {
    try {
      const r = await api<{ issue: Issue }>(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
      setIssues((x) => x.map((i) => (i.id === id ? r.issue : i)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="panel">
      <h2>Issue log</h2>
      <form className="stack" onSubmit={(e) => void add(e)}>
        <div className="row">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            {CATS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <input type="date" value={startedOn} max={today()} onChange={(e) => setStartedOn(e.target.value)} aria-label="Started on" required />
        </div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's happening?" required aria-label="Description" />
        <label className="check">
          <input type="checkbox" checked={notified} onChange={(e) => setNotified(e.target.checked)} /> Landlord notified
        </label>
        <button className="btn primary" disabled={!description.trim()}>Add issue</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="issues">
        {issues.length === 0 && <li className="muted">No issues logged yet.</li>}
        {issues.map((i) => (
          <li key={i.id} className={i.status}>
            <div>
              <span className="pill">{i.category.replace('_', ' ')}</span>{' '}
              {i.status === 'open' ? <strong>day {dayNum(i.startedOn)}</strong> : <span className="ok">resolved</span>}
              <div>{i.description}</div>
              <div className="muted small">
                since {i.startedOn} · {i.landlordNotified ? `landlord notified${i.notifiedOn ? ' ' + i.notifiedOn : ''}` : 'landlord not notified'}
              </div>
            </div>
            {i.status === 'open' && <button className="btn" onClick={() => void resolve(i.id)}>Resolve</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
