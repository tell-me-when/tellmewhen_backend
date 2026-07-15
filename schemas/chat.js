import { z } from 'zod';

export const deleteChannelSchema = z.object({
  jobId: z.string().trim().min(1).max(512),
});
