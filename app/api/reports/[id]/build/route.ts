import { NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // your NextAuth wrapper
import { db } from "@/lib/db"; // Prisma client
import { inngest } from "@/lib/inngest";


export async function POST(_req: Request, { params }: { params: { id: string } }) {
const session = await auth();
if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });


const reportProject = await db.project.findUnique({
where: { id: params.id },
select: { id: true, organisationId: true, version: true }
});
if (!reportProject) return new NextResponse("Not Found", { status: 404 });


// TODO: enforce org-level access based on session.user and membership
// e.g., ensure user is OWNER or DESIGNER of reportProject.organisationId


const version = (reportProject.version ?? 1) + 1;


await inngest.send({
name: "report/generate",
data: {
projectId: reportProject.id,
organisationId: reportProject.organisationId,
requestedByUserId: session.user.id,
version
}
});


return NextResponse.json({ status: "enqueued", projectId: reportProject.id, version }, { status: 202 });
}
