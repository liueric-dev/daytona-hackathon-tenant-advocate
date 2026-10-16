import { useState } from 'react';
import { api } from '../api';

export interface BuildingData {
  building: { label: string; bin: string; bbl: string; borough: string };
  fetchedAt: string;
  violations: {
    openTotal: number;
    openByClass: { A: number; B: number; C: number };
    rentImpairingOpen: number;
    recentOpen: { violationid: string; class: string; inspectiondate: string; novdescription: string; citation: string }[];
  };
  complaints: {
    last12Months: number;
    heatHotWaterLast12Months: number;
    byCategoryLast12Months: Record<string, number>;
    recent: { complaint_id: string; received_date: string; major_category: string; minor_category: string; complaint_status: string; citation: string }[];
  };
  notes: string[];
  sources: { name: string; url: string }[];
}

const KEY = 'ta.address';
function loadAddr() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function BuildingCard({ onAddress }: { onAddress: (a: string) => void }) {
  const [address, setAddress] = useState(loadAddr);
  const [data, setData] = useState<BuildingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function check() {
    const a = address.trim();
    if (!a) return;
    try {
      localStorage.setItem(KEY, a);
    } catch {
      /* ignore */
    }
    onAddress(a);
    setLoading(true);
    setError(null);
    try {
      setData(await api<BuildingData>(`/api/building?address=${encodeURIComponent(a)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const v = data?.violations;
  return (
    <section className="panel">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <input
          className="grow"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Your address, e.g. 123 W 145th St, Manhattan"
          aria-label="Address"
        />
        <button className="btn primary" disabled={loading || !address.trim()}>
          {loading ? 'Checking…' : 'Check building'}
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      {data && v && (
        <>
          <div className="bhead">
            <h2>{data.building.label}</h2>
            <span className="muted">BIN {data.building.bin} · {data.building.borough}</span>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="big">{v.openTotal}</div>
              <div className="lbl">Open violations</div>
              <div className="chips">
                <span className="chip c">C {v.openByClass.C}</span>
                <span className="chip b">B {v.openByClass.B}</span>
                <span className="chip a">A {v.openByClass.A}</span>
              </div>
            </div>
            <div className="stat">
              <div className="big">{v.rentImpairingOpen}</div>
              <div className="lbl">Rent-impairing open</div>
            </div>
            <div className="stat">
              <div className="big">{data.complaints.last12Months}</div>
              <div className="lbl">Complaints, last 12 mo</div>
            </div>
            <div className="stat">
              <div className="big">{data.complaints.heatHotWaterLast12Months}</div>
              <div className="lbl">Heat / hot water complaints</div>
            </div>
          </div>
          <p className="caption">Complaints are reports, not findings.</p>
          {data.notes.map((n, i) => (
            <p key={i} className="muted small">{n}</p>
          ))}
          <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide' : 'Show'} recent violations and complaints
          </button>
          {open && (
            <div className="recent">
              <h3>Recent open violations</h3>
              <ul>
                {v.recentOpen.map((x) => (
                  <li key={x.violationid}>
                    <span className="pill">{x.citation}</span> Class {x.class} · {x.inspectiondate?.slice(0, 10)} · {x.novdescription}
                  </li>
                ))}
              </ul>
              <h3>Recent complaints (reports)</h3>
              <ul>
                {data.complaints.recent.map((x) => (
                  <li key={x.complaint_id}>
                    <span className="pill">{x.citation}</span> {x.received_date?.slice(0, 10)} · {x.major_category} / {x.minor_category} · {x.complaint_status}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted small">
            Sources:{' '}
            {data.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
              </span>
            ))}
          </p>
        </>
      )}
    </section>
  );
}
