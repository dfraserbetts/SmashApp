'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const ensureRes = await fetch('/api/auth/ensure-profile', {
      method: 'POST',
      credentials: 'include',
    });

    if (!ensureRes.ok) {
      let message = 'Failed to sync profile.';
      try {
        const payload = await ensureRes.json();
        if (payload?.error) message = payload.error;
      } catch {}
      setErr(message);
      setLoading(false);
      return;
    }

    router.replace('/dashboard');
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
      <section className="border border-zinc-800 rounded-xl p-8 max-w-md w-full bg-zinc-950">
        <h1 className="text-xl font-semibold mb-1">SMASH Login</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Enter the tavern. Don’t fail your Deception check.
        </p>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-zinc-300">Email</span>
            <input
              type="email"
              name="email"
              required
              className="px-3 py-2 rounded-lg bg-black border border-zinc-800"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-zinc-300">Password</span>
            <input
              type="password"
              name="password"
              required
              className="px-3 py-2 rounded-lg bg-black border border-zinc-800"
            />
          </label>

          {err && (
            <p className="text-sm text-red-400 border border-red-900/40 bg-red-950/20 rounded-lg p-2">
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <p className="text-sm text-zinc-400 mt-4">
          No account?{' '}
          <Link
            href="/signup"
            className="text-zinc-200 hover:text-white underline underline-offset-2"
          >
            Create one
          </Link>
        </p>
        <p className="text-sm text-zinc-400 mt-3">
          Forgot your password?{' '}
          <Link
            href="/auth/forgot-password"
            className="text-zinc-200 hover:text-white underline underline-offset-2"
          >
            Reset it
          </Link>
        </p>
      </section>
    </main>
  );
}
