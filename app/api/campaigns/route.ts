import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();

  // Parse input
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }

  // Cookie-based auth (SSR)
  const { data: auth, error: authErr } = await supabase.auth.getUser();

  if (authErr || !auth?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerUserId = auth.user.id;

  // 1) Create campaign
  const { data: created, error: cErr } = await supabase
    .from("Campaign")
    .insert({
      name,
      ownerUserId,
      descriptorVersionTag: "v0",
    })
    .select("id")
    .single();

  if (cErr || !created?.id) {
    return NextResponse.json(
      { error: cErr?.message ?? "Failed to create campaign" },
      { status: 500 }
    );
  }

  // 2) Create membership
  const { error: mErr } = await supabase.from("CampaignUser").insert({
    campaignId: created.id,
    userId: ownerUserId,
    role: "GAME_DIRECTOR",
  });

  if (mErr) {
    return NextResponse.json(
      { error: mErr.message ?? "Failed to create membership" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: created.id });
}
