import { NextRequest, NextResponse } from "next/server";
import { listStudents, createStudent } from "@/lib/firebase/db";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const students = await listStudents();
    return NextResponse.json({ students, fetchedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "fetch_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();

  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "invalid_body", message: "name is required." }, { status: 400 });
  }

  try {
    const student = await createStudent({
      name: body.name.trim(),
      status: body.status === "inactive" ? "inactive" : "active",
      ...(body.classGroup?.trim() ? { classGroup: body.classGroup.trim() } : {}),
      ...(body.schedule?.trim() ? { schedule: body.schedule.trim() } : {}),
      ...(body.parentConnected !== undefined ? { parentConnected: Boolean(body.parentConnected) } : {}),
      ...(body.tuition !== undefined && body.tuition !== null && body.tuition !== ""
        ? { tuition: Number(body.tuition) }
        : {}),
      ...(body.nextPayment?.trim() ? { nextPayment: body.nextPayment.trim() } : {}),
      ...(body.parentEmail?.trim() ? { parentEmail: body.parentEmail.trim().toLowerCase() } : {}),
      ...(body.plan === "Main Course" || body.plan === "Initial Demo" ? { plan: body.plan } : {}),
      ...(body.photoUrl?.trim() ? { photoUrl: body.photoUrl.trim() } : {}),
      ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
      ...(Array.isArray(body.tags) && body.tags.length ? { tags: body.tags } : {}),
    });
    return NextResponse.json(student, { status: 201 });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "create_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
