import { NextRequest, NextResponse } from "next/server";
import { updateStudent, deleteStudent } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.status !== undefined) updates.status = body.status === "inactive" ? "inactive" : "active";
  if (body.classGroup !== undefined) updates.classGroup = body.classGroup.trim() || null;
  if (body.schedule !== undefined) updates.schedule = body.schedule.trim() || null;
  if (body.parentConnected !== undefined) updates.parentConnected = Boolean(body.parentConnected);
  if (body.tuition !== undefined) updates.tuition = body.tuition === "" ? null : Number(body.tuition);
  if (body.nextPayment !== undefined) updates.nextPayment = body.nextPayment.trim() || null;
  if (body.parentEmail !== undefined) updates.parentEmail = body.parentEmail.trim().toLowerCase() || null;
  if (body.plan !== undefined) updates.plan = body.plan === "Main Course" || body.plan === "Initial Demo" ? body.plan : null;
  if (body.photoUrl !== undefined) updates.photoUrl = body.photoUrl.trim() || null;
  if (body.notes !== undefined) updates.notes = body.notes.trim() || null;
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];

  const student = await updateStudent(params.id, updates);
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(student);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const ok = await deleteStudent(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
