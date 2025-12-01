// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest, generateReportFn } from "@/src/inngest/reportGenerate";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateReportFn],
});
