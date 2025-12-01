export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const project = await db.project.findUnique({
    where: { id: params.id },
    select: { id: true, organisationId: true, version: true },
  });
  if (!project) return new NextResponse("Not Found", { status: 404 });

  const version = (project.version ?? 1) + 1;

  await inngest.send({
    name: "report/generate",
    data: {
      projectId: project.id,
      organisationId: project.organisationId,
      requestedByUserId: (session.user as any).id,
      version,
    },
  });

  return NextResponse.json({ status: "enqueued", projectId: project.id, version }, { status: 202 });
}
