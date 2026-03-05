import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";

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

// SC_API_CAMPAIGNS_LIST
export async function GET() {
  const supabase = await getSupabaseServer();

  // Get authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Get campaign IDs where user is owner OR member
  const { data: membershipRows, error: membershipError } = await supabase
    .from("CampaignUser")
    .select("campaignId")
    .eq("userId", userId);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  const memberCampaignIds = (membershipRows ?? []).map((r) => r.campaignId);

  // Also include campaigns they own directly
  const { data: ownedRows, error: ownedError } = await supabase
    .from("Campaign")
    .select("id")
    .eq("ownerUserId", userId);

  if (ownedError) {
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }

  const ownedCampaignIds = (ownedRows ?? []).map((r) => r.id);

  const allCampaignIds = Array.from(new Set([...memberCampaignIds, ...ownedCampaignIds]));

  if (allCampaignIds.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  const { data: campaigns, error: campaignsError } = await supabase
    .from("Campaign")
    .select("id, name")
    .in("id", allCampaignIds)
    .order("createdAt", { ascending: true });

  if (campaignsError) {
    return NextResponse.json({ error: campaignsError.message }, { status: 500 });
  }

  return NextResponse.json({
    campaigns: campaigns ?? [],
  });
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
  const campaignId = randomUUID();

  // 1) Create campaign
  const { error: cErr } = await supabase
    .from("Campaign")
    .insert({
      id: campaignId,
      name,
      ownerUserId,
      descriptorVersionTag: "v0",
    });

  if (cErr) {
    return NextResponse.json(
      { error: cErr?.message ?? "Failed to create campaign" },
      { status: 500 }
    );
  }

  // 2) Create membership
  const { error: mErr } = await supabase.from("CampaignUser").insert({
    campaignId,
    userId: ownerUserId,
    role: "GAME_DIRECTOR",
  });

  if (mErr) {
    return NextResponse.json(
      { error: mErr.message ?? "Failed to create membership" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: campaignId });
}
