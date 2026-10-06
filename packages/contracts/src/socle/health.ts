import { z } from 'zod';

export const HealthResponse = z.object({ status: z.literal('ok') }).meta({ id: 'HealthResponse' });
export type HealthResponse = z.infer<typeof HealthResponse>;
