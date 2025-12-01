// src/inngest/reportGenerate.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "heat-demand-app",
});

// Very simple background job for now – just logs and returns OK.
// You can expand this later to actually build the PDF and upload to S3.
export const generateReportFn = inngest.createFunction(
  { id: "report-generate" },
  { event: "report/generate" },
  async ({ event, step }) => {
    await step.run("log-request", async () => {
      console.log("Generate report requested", {
        projectId: event.data.projectId,
        organisationId: event.data.organisationId,
        version: event.data.version,
      });
    });

    return {
      ok: true,
      projectId: event.data.projectId,
      organisationId: event.data.organisationId,
      version: event.data.version,
    };
  }
);
