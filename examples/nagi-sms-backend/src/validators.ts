import { z } from 'zod';

export const campaignSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  numbers: z.array(z.string().trim().min(1)).min(1).max(6000),
  variables: z
    .array(z.record(z.string(), z.string()))
    .optional()
    .refine((val) => !val || val.length > 0, {
      message: 'Variables must be provided per recipient or omitted.',
    }),
});

export const unsubscribeSchema = z.object({
  phone: z.string().min(1),
});
