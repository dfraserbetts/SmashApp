import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

export async function getSupabaseServer() {
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
          cookieStore.set({ name, value, ...(options as Record<string, unknown>) });
        },
        remove(name: string, options: unknown) {
          cookieStore.set({ name, value: "", ...(options as Record<string, unknown>) });
        },
      },
    },
  );
}

export async function requireUserId(): Promise<string> {
  const user = await requireSupabaseUser();
  return user.id;
}

export async function requireSupabaseUser(): Promise<User> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return data.user;
}
