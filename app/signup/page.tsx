'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabaseClient';

export default function SignupPage() {
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
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id ?? data.session?.user?.id;

    if (!userId) {
      setErr('Signup succeeded but no user id was returned.');
      setLoading(false);
      return;
    }

    const ensureRes = await fetch('/api/auth/ensure-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!ensureRes.ok) {
      let message = 'Failed to create profile.';
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
        <h1 className="text-xl font-semibold mb-1">Create Account</h1>
        <p className="text-sm text-zinc-400 mb-6">
          New to the tavern? Let us check your credentials.
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

          <label className="grid gap-1">
            <span className="text-sm text-zinc-300">Confirm Password</span>
            <input
              type="password"
              name="confirmPassword"
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-zinc-400 mt-4">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-zinc-200 hover:text-white underline underline-offset-2"
          >
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
