import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { ask, getDraft, setDraftStatus } from '../services/agent.js';
import { llmConfigured, llmMissingMessage } from '../services/llm.js';

export const agentRouter = Router();
agentRouter.use(requireAuth);

const askBody = z.object({
  question: z.string().trim().min(3).max(4000),
  address: z.string().trim().max(200).optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) }))
    .max(12)
    .optional(),
});

const askLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

agentRouter.post('/ask', askLimiter, async (req, res) => {
  if (!llmConfigured()) throw new HttpError(503, `Model not configured: ${llmMissingMessage()}`);
  const body = askBody.parse(req.body);
  res.json(await ask(req.user!.sub, body.question, { address: body.address, history: body.history }));
});

// Human approval gate. Approving only marks the draft; the app never sends anything.
const statusBody = z.object({ status: z.enum(['approved', 'discarded']) });

agentRouter.get('/drafts/:id', (req, res) => {
  const d = getDraft(req.user!.sub, req.params.id as string);
  if (!d) throw new HttpError(404, 'Draft not found');
  res.json({ draft: d });
});

agentRouter.post('/drafts/:id', (req, res) => {
  const { status } = statusBody.parse(req.body);
  const d = setDraftStatus(req.user!.sub, req.params.id as string, status);
  if (!d) throw new HttpError(404, 'Draft not found');
  res.json({ draft: d });
});
