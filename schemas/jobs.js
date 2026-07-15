import { z } from 'zod';

export const assignJobSchema = z.object({
  jid: z.string().trim().min(1).max(512),
  uid: z.coerce.number().int().positive(),
});

export const newJobSchema = z.object({
  description: z.string().trim().min(1).max(500),
  dueDate: z.string().trim().min(1).refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'dueDate must be a valid date',
  }),
  assignedId: z.coerce.number().int().positive(),
});

export const completeJobSchema = z.object({
  remarks: z.string().trim().max(500).optional().default(''),
});

export const notifyJobSchema = z.object({
  title: z.string().trim().max(200).optional(),
  message: z.string().trim().max(1000).optional(),
});
