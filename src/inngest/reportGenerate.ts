import { Inngest } from "inngest";
const project = await step.run("load-project", async () =>
db.project.findUnique({
where: { id: projectId },
include: {
building: true,
rooms: { include: { elements: true, psiJunctions: true } },
ventilation: true,
},
})
);
if (!project) throw new Error("Project not found");


// 2) Render HTML (SSR) – replace with your templating approach
const html = await step.run("render-html", async () => {
// TODO: Use your React/Handlebars template and calculation summaries
return `<!doctype html><html><body><h1>MCS Report</h1><p>Project ${project.name}</p></body></html>`;
});


// 3) Print to PDF via Playwright
const pdfBuffer = await step.run("render-pdf", async () => {
const { chromium } = await playwright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
const pdf = await page.pdf({ format: "A4", printBackground: true });
await browser.close();
return pdf;
});


// 4) Upload to S3 (eu-west-2)
const s3 = new S3Client({ region: "eu-west-2" });
const key = path.posix.join(
organisationId,
projectId,
`report-v${version}-${Date.now()}.pdf`
);


await step.run("upload-s3", async () => {
await s3.send(
new PutObjectCommand({
Bucket: process.env.S3_BUCKET!,
Key: key,
Body: pdfBuffer,
ContentType: "application/pdf",
})
);
});


// 5) Persist Report row
const report = await step.run("persist-report", async () =>
db.report.create({
data: {
projectId,
version,
pdfUrl: `s3://${process.env.S3_BUCKET}/${key}`,
createdById: requestedByUserId,
},
})
);


return { ok: true, reportId: report.id, key };
}
);
