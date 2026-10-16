import { env } from '../config.js';

/**
 * NYC Open Data (Socrata) access for HPD records.
 *
 * Field names below come from the datasets' published column metadata.
 *   violations (wvxf-dwi5): inspector-issued violations. Keys: bin, buildingid, boroid+block+lot.
 *   complaints (ygpa-z7cr): public complaints and their problems. Keys: bbl, bin, building_id.
 * Complaints are reports, not findings; violations are mostly issued after inspection.
 * The two datasets share `bin` and the block/lot pair, but have no common `bbl` column.
 */
export const HPD_DATASETS = {
  violations: 'wvxf-dwi5',
  complaints: 'ygpa-z7cr',
} as const;
export type HpdDataset = keyof typeof HPD_DATASETS;

export const VIOLATION_FIELDS = [
  'violationid', 'buildingid', 'boroid', 'housenumber', 'streetname', 'zip', 'apartment', 'block', 'lot',
  'class', 'inspectiondate', 'novdescription', 'novissueddate', 'currentstatus', 'currentstatusdate',
  'violationstatus', 'rentimpairing', 'bin',
] as const;

export const COMPLAINT_FIELDS = [
  'received_date', 'problem_id', 'complaint_id', 'building_id', 'borough', 'house_number', 'street_name',
  'post_code', 'block', 'lot', 'apartment', 'unit_type', 'space_type', 'major_category', 'minor_category',
  'complaint_status', 'complaint_status_date', 'problem_status', 'problem_status_date', 'status_description',
  'problem_duplicate_flag', 'bin', 'bbl',
] as const;

export interface SoqlParams {
  select?: string;
  where?: string;
  order?: string;
  group?: string;
  limit?: number;
}

const BASE_URL = 'https://data.cityofnewyork.us/resource';

export async function queryHpd<T = Record<string, unknown>>(dataset: HpdDataset, params: SoqlParams = {}): Promise<T[]> {
  const url = new URL(`${BASE_URL}/${HPD_DATASETS[dataset]}.json`);
  if (params.select) url.searchParams.set('$select', params.select);
  if (params.where) url.searchParams.set('$where', params.where);
  if (params.order) url.searchParams.set('$order', params.order);
  if (params.group) url.searchParams.set('$group', params.group);
  url.searchParams.set('$limit', String(params.limit ?? 50));

  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...(env.SOCRATA_APP_TOKEN ? { 'X-App-Token': env.SOCRATA_APP_TOKEN } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`NYC Open Data ${dataset} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}
