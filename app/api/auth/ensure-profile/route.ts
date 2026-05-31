import { NextResponse } from "next/server";
import { upsertUserProfileFromAuthUser } from "@/lib/auth/profile";
import { requireSupabaseUser } from "@/lib/auth/server";

export async function POST() {
  try {
    const user = await requireSupabaseUser();
    const profile = await upsertUserProfileFromAuthUser(user);

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
