'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data, error } = await supabaseClient.auth.getSession();

      if (cancelled) return;

      // If auth is borked, treat it as logged-out.
      if (error || !data.session) {
        router.replace('/login');
      } else {
        router.replace('/dashboard');
      }

      setChecking(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="text-sm text-zinc-400">
          Rolling initiative for your session.
        </div>
        {checking && <div className="text-xs text-zinc-600">Checking auth…</div>}
      </div>
    </main>
  );
}
