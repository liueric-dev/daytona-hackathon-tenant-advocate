import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env, rootDir } from '../config.js';
import { HttpError } from '../errors.js';
import { recall, remember, type MemoryResponse } from './memory.js';

export const ISSUE_CATEGORIES = ['heat', 'hot_water', 'pests', 'leak', 'mold', 'repairs', 'fees', 'rent', 'other'] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export type Issue = {
  id: string;
  userSub: string;
  category: IssueCategory;
  description: string;
  startedOn: string; // YYYY-MM-DD
  landlordNotified: boolean;
  notifiedOn?: string;
  status: 'open' | 'resolved';
  createdAt: string;
};

export type NewIssueInput = {
  category: IssueCategory;
  description: string;
  startedOn: string;
  landlordNotified?: boolean;
  notifiedOn?: string;
};

export type IssuePatch = Partial<Pick<Issue, 'status' | 'landlordNotified' | 'notifiedOn'>>;

type Store = Record<string, Issue[]>;

const dataDir = path.join(rootDir, 'data', 'uploads');
const filePath = path.join(dataDir, 'issues.json');

// Serialises read-modify-write cycles so concurrent requests can't lose updates.
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function readStore(): Promise<Store> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

const memoryConfigured = () =>
  Boolean(env.AGENT_MEMORY_ENDPOINT && env.AGENT_MEMORY_CONTEXT && env.AGENT_MEMORY_API_KEY);

function summarize(issue: Issue): string {
  const label = issue.category.replace('_', ' ');
  const notified = issue.landlordNotified
    ? `The landlord was notified${issue.notifiedOn ? ` on ${issue.notifiedOn}` : ''}.`
    : 'The landlord has not been notified.';
  const desc = issue.description.replace(/\s+/g, ' ').trim();
  return `Tenant reported a ${label} issue starting ${issue.startedOn}: ${desc} ${notified}`;
}

/** Best-effort mirror into Agent Memory; never throws. */
function mirrorToMemory(issue: Issue): void {
  if (!memoryConfigured()) return;
  remember(summarize(issue), { scopes: [`user:${issue.userSub}`] })
    .then((res) => {
      if (!res.ok) console.error(`[issues] agent memory remember failed: HTTP ${res.status}`);
    })
    .catch((err) => console.error('[issues] agent memory remember failed:', err));
}

export async function listIssues(userSub: string): Promise<Issue[]> {
  const store = await readStore();
  return store[userSub] ?? [];
}

export function addIssue(userSub: string, input: NewIssueInput): Promise<Issue> {
  return locked(async () => {
    const store = await readStore();
    const landlordNotified = input.landlordNotified ?? false;
    const issue: Issue = {
      id: randomUUID(),
      userSub,
      category: input.category,
      description: input.description,
      startedOn: input.startedOn,
      landlordNotified,
      ...(landlordNotified && input.notifiedOn ? { notifiedOn: input.notifiedOn } : {}),
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    store[userSub] = [...(store[userSub] ?? []), issue];
    await writeStore(store);
    mirrorToMemory(issue);
    return issue;
  });
}

export function updateIssue(userSub: string, id: string, patch: IssuePatch): Promise<Issue> {
  return locked(async () => {
    const store = await readStore();
    const list = store[userSub] ?? [];
    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) throw new HttpError(404, 'Issue not found');
    const next: Issue = { ...list[idx]! };
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.landlordNotified !== undefined) next.landlordNotified = patch.landlordNotified;
    if (patch.notifiedOn !== undefined) next.notifiedOn = patch.notifiedOn;
    if (!next.landlordNotified) delete next.notifiedOn;
    list[idx] = next;
    store[userSub] = list;
    await writeStore(store);
    return next;
  });
}

/** Semantic recall scoped to this user; null when Agent Memory isn't configured. */
export async function recallIssueContext(userSub: string, query: string): Promise<MemoryResponse | null> {
  if (!memoryConfigured()) return null;
  return recall(query, { lens: [`user:${userSub}`] });
}
