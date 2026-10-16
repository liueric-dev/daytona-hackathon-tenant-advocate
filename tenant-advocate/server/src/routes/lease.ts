import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { env } from '../config.js';
import { HttpError } from '../errors.js';
import { extractLeaseTerms, getLease, pdfToTextInSandbox, storeLease } from '../services/lease.js';
import { llmConfigured, llmMissingMessage } from '../services/llm.js';

export const leaseRouter = Router();
leaseRouter.use(requireAuth);

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

async function process_(userSub: string, text: string, res: Response): Promise<void> {
  if (!text.trim()) throw new HttpError(422, 'No text could be extracted from the document');
  const terms = await extractLeaseTerms(text);
  const stored = storeLease(userSub, text, terms);
  res.json({ terms: stored.terms, uploadedAt: stored.uploadedAt });
}

leaseRouter.post(
  '/upload',
  express.raw({ type: 'application/pdf', limit: '10mb' }),
  wrap(async (req, res) => {
    if (!llmConfigured()) throw new HttpError(503, `Model not configured: ${llmMissingMessage()}`);
    if (!env.DAYTONA_API_KEY) throw new HttpError(503, 'Daytona not configured; use POST /text instead');
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length < 5 || body.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new HttpError(400, 'Send a PDF as the raw request body with Content-Type: application/pdf');
    }
    let text: string;
    try {
      text = await pdfToTextInSandbox(body);
    } catch (err) {
      throw new HttpError(502, `Sandbox extraction failed: ${(err as Error).message}. Try POST /text.`);
    }
    await process_(req.user!.sub, text, res);
  }),
);

const textBody = z.object({ text: z.string().min(1).max(200_000) });

leaseRouter.post(
  '/text',
  express.json({ limit: '1mb' }),
  wrap(async (req, res) => {
    if (!llmConfigured()) throw new HttpError(503, `Model not configured: ${llmMissingMessage()}`);
    const parsed = textBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Body must be JSON {text} up to 200000 characters');
    await process_(req.user!.sub, parsed.data.text, res);
  }),
);

leaseRouter.get('/', (req, res) => {
  const lease = getLease(req.user!.sub);
  if (!lease) {
    res.status(404).json({ error: 'No lease uploaded' });
    return;
  }
  res.json({ terms: lease.terms, uploadedAt: lease.uploadedAt });
});
