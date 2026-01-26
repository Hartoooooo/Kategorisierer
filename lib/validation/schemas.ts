import { z } from "zod";

export const isinSchema = z.string().regex(/^[A-Z]{2}[A-Z0-9]{10}$/, {
  message: "ISIN muss dem Format entsprechen: 2 Buchstaben + 10 alphanumerische Zeichen",
});

export const parsedRowSchema = z.object({
  rowIndex: z.number(),
  isin: z.string(),
  name: z.string(),
  wkn: z.string(),
  validIsin: z.boolean(),
  originalRowData: z.record(z.unknown()).optional(),
});

export const checkRequestSchema = z.object({
  jobId: z.string(),
  rows: z.array(parsedRowSchema.passthrough()),
  batchIndex: z.number().optional(), // 0 = erste 50, 1+ = je 40 weitere
  offset: z.number().optional(), // Start-Offset für den Batch
});
