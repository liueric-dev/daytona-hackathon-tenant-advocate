export interface Violation {
  violationid: string;
  class: string;
  inspectiondate?: string;
  novdescription?: string;
  citation?: string;
}
export interface Complaint {
  complaint_id: string;
  received_date?: string;
  major_category?: string;
  minor_category?: string;
  complaint_status?: string;
  citation?: string;
}
export interface BuildingRecord {
  building: { label: string; bin?: string; bbl?: string; borough?: string };
  violations: {
    openTotal: number;
    openByClass: { A?: number; B?: number; C?: number };
    rentImpairingOpen: number;
    recentOpen: Violation[];
  };
  complaints: {
    last12Months: number;
    heatHotWaterLast12Months: number;
    byCategoryLast12Months?: Record<string, number>;
    recent: Complaint[];
  };
  notes: string[];
  sources: { name: string; url: string }[];
}

export interface Term {
  value: unknown;
  quote?: string | null;
  page?: number | null;
  verified?: boolean;
  label?: string;
  name?: string;
}
export interface RedFlag {
  issue: string;
  quote?: string;
  page?: number | null;
  why?: string;
  checkWith?: string;
  verified?: boolean;
}
export interface LeaseTerms {
  monthlyRent?: Term;
  securityDeposit?: Term;
  leaseStart?: Term;
  leaseEnd?: Term;
  renewal?: Term;
  repairsAndMaintenance?: Term;
  subletting?: Term;
  earlyTermination?: Term;
  heatAndHotWater?: Term;
  fees?: Term[];
  otherNotableClauses?: Term[];
  redFlags?: RedFlag[];
}
export interface LeaseRecord {
  terms: LeaseTerms;
  uploadedAt: string;
}

export type IssueCategory = 'heat' | 'hot_water' | 'pests' | 'leak' | 'mold' | 'repairs' | 'fees' | 'rent' | 'other';
export interface Issue {
  id: string;
  category: IssueCategory;
  description: string;
  startedOn: string;
  landlordNotified: boolean;
  notifiedOn?: string | null;
  status: string;
  createdAt: string;
}

export interface ToolCall {
  name: string;
  input?: unknown;
  ok: boolean;
}
export interface Draft {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: 'pending' | 'approved' | 'discarded' | string;
}
export interface CitationCheck {
  passed: boolean;
  sentences: number;
  uncited: string[];
}
export interface AskResponse {
  answer: string;
  toolCalls: ToolCall[];
  drafts: Draft[];
  citationCheck?: CitationCheck;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  draftIds?: string[];
  citationCheck?: CitationCheck;
  error?: boolean;
}

export type PanelKey = 'building' | 'lease' | 'issues' | 'letters';

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  heat: 'Heat',
  hot_water: 'Hot water',
  pests: 'Pests',
  leak: 'Leak',
  mold: 'Mold',
  repairs: 'Repairs',
  fees: 'Fees',
  rent: 'Rent',
  other: 'Other',
};

export function termText(t: Term | undefined): string {
  if (!t || t.value === null || t.value === undefined || t.value === '') return 'Not stated';
  const v = t.value;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return 'Not stated';
  }
}

export function dayCount(startedOn: string): number {
  const [y, m, d] = startedOn.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 1;
  const start = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(1, Math.round((today - start) / 86400000) + 1);
}

export function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Try again.';
}
