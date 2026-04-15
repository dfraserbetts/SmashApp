// app/admin/layout.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Link from "next/link";
import { prisma } from ".././../prisma/client";

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
        set(name: string, value: string, options: unknown) {
          try {
            cookieStore.set({ name, value, ...(options as Record<string, unknown>) });
          } catch {
            // Server Components can read cookies but cannot commit refreshes.
            // proxy.ts handles auth cookie writes on the request/response path.
          }
        },
        remove(name: string, options: unknown) {
          try {
            cookieStore.set({ name, value: "", ...(options as Record<string, unknown>) });
          } catch {
            // Server Components can read cookies but cannot commit refreshes.
            // proxy.ts handles auth cookie writes on the request/response path.
          }
        },
      },
    },
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    redirect("/login");
  }

  const userId = data.user.id;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });

  if (!profile?.isAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <Link className="text-sm underline" href="/dashboard">
            Back to Dashboard
          </Link>
        </div>

        <nav className="mb-6 rounded-lg border p-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">Core Ops</p>
              <div className="mt-1 flex flex-wrap gap-3">
                <Link className="underline" href="/admin/forge-values">
                  Forge Values
                </Link>
                <Link className="underline" href="/admin/monster-traits">
                  Monster Traits
                </Link>
                <Link className="underline" href="/admin/limit-break-templates">
                  Limit Break Templates
                </Link>
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">Game Ops</p>
              <div className="mt-1 flex flex-wrap gap-3">
                <Link className="underline" href="/admin/campaigns">
                  Campaign Inspector
                </Link>
                <Link className="underline" href="/admin/combat-tuning">
                  Combat Tuning
                </Link>
                <Link className="underline" href="/admin/power-tuning">
                  Power Tuning
                </Link>
                <Link className="underline" href="/admin/outcome-normalization">
                  Outcome Normalization
                </Link>
                <Link className="underline" href="/admin/canary-harness">
                  Power Radar Comparison
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {children}
      </div>
    </div>
  );
}
