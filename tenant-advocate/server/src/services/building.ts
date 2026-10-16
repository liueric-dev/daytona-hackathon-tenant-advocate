import { queryHpd } from './hpd.js';
import { traced } from './tracing.js';

/**
 * Address -> building -> HPD record.
 *
 * Geocoding uses NYC Planning Labs GeoSearch (public, no key), which returns the PAD
 * BIN/BBL for an address. HPD violations and complaints are then pulled by BIN.
 * Every record we return keeps its source id so the agent can cite it.
 */

export interface ResolvedBuilding {
  label: string;
  bin: string;
  bbl?: string;
  borough?: string;
}

export interface ViolationRow {
  violationid: string;
  class?: string;
  inspectiondate?: string;
  novdescription?: string;
  violationstatus?: string;
  currentstatus?: string;
  rentimpairing?: string;
  apartment?: string;
}

export interface ComplaintRow {
  complaint_id?: string;
  problem_id?: string;
  received_date?: string;
  major_category?: string;
  minor_category?: string;
  complaint_status?: string;
  problem_status?: string;
  status_description?: string;
  apartment?: string;
}

export interface BuildingRecord {
  building: ResolvedBuilding;
  fetchedAt: string;
  violations: {
    openTotal: number;
    openByClass: Record<string, number>;
    rentImpairingOpen: number;
    recentOpen: (ViolationRow & { citation: string })[];
  };
  complaints: {
    last12Months: number;
    heatHotWaterLast12Months: number;
    byCategoryLast12Months: Record<string, number>;
    recent: (ComplaintRow & { citation: string })[];
  };
  notes: string[];
  sources: { name: string; url: string }[];
}

const GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2/search';

interface GeoFeature {
  properties?: {
    label?: string;
    borough?: string;
    addendum?: { pad?: { bin?: string; bbl?: string } };
  };
}

export async function resolveAddress(address: string): Promise<ResolvedBuilding> {
  return traced('building.geocode', 'TOOL', { 'input.value': address }, async () => {
    const url = new URL(GEOSEARCH);
    url.searchParams.set('text', address);
    url.searchParams.set('size', '1');
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`GeoSearch returned ${res.status}`);
    const data = (await res.json()) as { features?: GeoFeature[] };
    const p = data.features?.[0]?.properties;
    const bin = p?.addendum?.pad?.bin;
    // BINs ending in 000000 are placeholder "million" BINs with no real building.
    if (!p || !bin || /^\d000000$/.test(bin)) {
      throw new AddressNotFound(`Could not find an NYC building for "${address}". Include the borough or ZIP.`);
    }
    return { label: p.label ?? address, bin, bbl: p.addendum?.pad?.bbl, borough: p.borough };
  });
}

export class AddressNotFound extends Error {}

/** Safe for SoQL: BINs are digits only. */
const assertBin = (bin: string) => {
  if (!/^\d{7}$/.test(bin)) throw new Error(`Invalid BIN ${bin}`);
  return bin;
};

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

const HEAT_RE = /heat|hot water/i;

export async function getBuildingRecord(address: string): Promise<BuildingRecord> {
  return traced('building.record', 'RETRIEVER', { 'input.value': address }, async () => {
    const building = await resolveAddress(address);
    const bin = assertBin(building.bin);
    const since = isoDaysAgo(365);

    const [openByClassRows, recentOpen, rentImpairing, complaintAgg, recentComplaints] = await Promise.all([
      queryHpd<{ class: string; n: string }>('violations', {
        select: 'class, count(*) as n',
        where: `bin='${bin}' AND violationstatus='Open'`,
        group: 'class',
      }),
      queryHpd<ViolationRow>('violations', {
        select: 'violationid, class, inspectiondate, novdescription, violationstatus, currentstatus, rentimpairing, apartment',
        where: `bin='${bin}' AND violationstatus='Open'`,
        order: 'inspectiondate DESC',
        limit: 15,
      }),
      queryHpd<{ n: string }>('violations', {
        select: 'count(*) as n',
        where: `bin='${bin}' AND violationstatus='Open' AND rentimpairing='Y'`,
      }),
      queryHpd<{ major_category: string; n: string }>('complaints', {
        select: 'major_category, count(*) as n',
        where: `bin='${bin}' AND received_date >= '${since}'`,
        group: 'major_category',
      }),
      queryHpd<ComplaintRow>('complaints', {
        select:
          'complaint_id, problem_id, received_date, major_category, minor_category, complaint_status, problem_status, status_description, apartment',
        where: `bin='${bin}'`,
        order: 'received_date DESC',
        limit: 15,
      }),
    ]);

    const openByClass: Record<string, number> = {};
    for (const r of openByClassRows) openByClass[r.class ?? '?'] = Number(r.n);
    const byCategoryLast12Months: Record<string, number> = {};
    for (const r of complaintAgg) byCategoryLast12Months[r.major_category ?? 'UNKNOWN'] = Number(r.n);
    const heat = Object.entries(byCategoryLast12Months)
      .filter(([k]) => HEAT_RE.test(k))
      .reduce((s, [, n]) => s + n, 0);

    return {
      building,
      fetchedAt: new Date().toISOString(),
      violations: {
        openTotal: Object.values(openByClass).reduce((a, b) => a + b, 0),
        openByClass,
        rentImpairingOpen: Number(rentImpairing[0]?.n ?? 0),
        recentOpen: recentOpen.map((v) => ({ ...v, citation: `HPD violation #${v.violationid}` })),
      },
      complaints: {
        last12Months: Object.values(byCategoryLast12Months).reduce((a, b) => a + b, 0),
        heatHotWaterLast12Months: heat,
        byCategoryLast12Months,
        recent: recentComplaints.map((c) => ({
          ...c,
          citation: `HPD complaint #${c.complaint_id ?? '?'}${c.problem_id ? ` (problem ${c.problem_id})` : ''}`,
        })),
      },
      notes: [
        'Class C violations are "immediately hazardous", B "hazardous", A "non-hazardous" (HPD).',
        'Complaints are reports from the public, not findings. Violations are issued after an HPD inspection.',
        'Records are per building, not per apartment.',
      ],
      sources: [
        { name: 'HPD Housing Maintenance Code Violations', url: 'https://data.cityofnewyork.us/d/wvxf-dwi5' },
        { name: 'HPD Housing Maintenance Code Complaints and Problems', url: 'https://data.cityofnewyork.us/d/ygpa-z7cr' },
        { name: 'HPD Online building lookup', url: `https://hpdonline.nyc.gov/hpdonline/building/search-results?bin=${bin}` },
      ],
    };
  });
}
