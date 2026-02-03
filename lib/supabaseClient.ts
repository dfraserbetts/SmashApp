import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  _client = createBrowserClient(url, anon);
  return _client;
}

/**
 * Back-compat export: behaves like the old singleton, but does NOT create
 * the client until a property is actually accessed at runtime.
 */
export const supabaseClient = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabaseBrowserClient();
      return (client as any)[prop];
    },
  }
) as ReturnType<typeof createBrowserClient>;