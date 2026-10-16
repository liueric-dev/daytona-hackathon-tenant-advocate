import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { ISSUE_CATEGORIES, addIssue, listIssues, updateIssue } from '../services/issues.js';

const todayUtc = () => new Date().toISOString().slice(0, 10);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'Invalid date');

const pastDate = dateString.refine((s) => s <= todayUtc(), 'Date cannot be in the future');

const createSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  description: z.string().trim().min(1).max(2000),
  startedOn: pastDate,
  landlordNotified: z.boolean().optional(),
  notifiedOn: pastDate.optional(),
});

const patchSchema = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
    landlordNotified: z.boolean().optional(),
    notifiedOn: pastDate.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), 'Nothing to update');

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg);
  }
  return result.data;
}

export const issuesRouter = Router();
issuesRouter.use(requireAuth);

issuesRouter.get('/', async (req, res) => {
  const issues = await listIssues(req.user!.sub);
  res.json({ issues: [...issues].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

issuesRouter.post('/', async (req, res) => {
  const input = parse(createSchema, req.body);
  const issue = await addIssue(req.user!.sub, input);
  res.status(201).json({ issue });
});

issuesRouter.patch('/:id', async (req, res) => {
  const patch = parse(patchSchema, req.body);
  const issue = await updateIssue(req.user!.sub, String(req.params.id), patch);
  res.json({ issue });
});
