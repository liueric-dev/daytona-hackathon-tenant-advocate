import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../errors.js';
import { AddressNotFound, getBuildingRecord } from '../services/building.js';

export const buildingRouter = Router();
buildingRouter.use(requireAuth);

const query = z.object({ address: z.string().trim().min(5).max(200) });

buildingRouter.get('/', async (req, res) => {
  const { address } = query.parse(req.query);
  try {
    res.json(await getBuildingRecord(address));
  } catch (err) {
    if (err instanceof AddressNotFound) throw new HttpError(404, err.message);
    throw new HttpError(502, `Building lookup failed: ${(err as Error).message}`);
  }
});
