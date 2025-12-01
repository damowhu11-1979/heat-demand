import { serve } from "@inngest/next";
import { generateReportFn } from "@/src/inngest/reportGenerate";

export const { GET, POST, PUT } = serve({
  client: { name: "heat-demand-app" },
  functions: [generateReportFn],
});
