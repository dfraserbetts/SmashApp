import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "../../../prisma/client";

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

export async function GET() {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const userId = data.user.id;

  // If profile row doesn't exist yet, treat as FREE (don't fail auth checks)
const profile = await prisma.userProfile.findUnique({
  where: { userId },
  select: { entitlementTier: true, isAdmin: true },
});

  return NextResponse.json({
    user: {
      id: userId,
      email: data.user.email ?? null,
      entitlementTier: profile?.entitlementTier ?? "FREE",
      isAdmin: profile?.isAdmin ?? false,
    },
  });
}
