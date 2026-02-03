import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    // Edge env not present — allow request through rather than 500-ing the whole app
    return res;
  }

  const supabase = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // This refreshes the session cookie when needed
  await supabase.auth.getUser();

  return res;
}

export const config = {
  matcher: [
    /*
      Run on all routes except Next internals/static.
    */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
