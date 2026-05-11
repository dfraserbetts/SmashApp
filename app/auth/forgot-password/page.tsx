'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

import { supabaseClient } from '@/lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setMessage(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    // Supabase Auth redirect URLs must allow this path for local and deployed domains.
    const redirectTo = `${window.location.origin}/auth/update-password`;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setMessage('If an account exists, a reset link has been sent.');
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
      <section className="border border-zinc-800 rounded-xl p-8 max-w-md w-full bg-zinc-950">
        <h1 className="text-xl font-semibold mb-1">Reset Password</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Enter your account email and we will send a password reset link.
        </p>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-zinc-300">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="px-3 py-2 rounded-lg bg-black border border-zinc-800"
            />
          </label>

          {err && (
            <p className="text-sm text-red-400 border border-red-900/40 bg-red-950/20 rounded-lg p-2">
              {err}
            </p>
          )}

          {message && (
            <p className="text-sm text-emerald-400 border border-emerald-900/40 bg-emerald-950/20 rounded-lg p-2">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p className="text-sm text-zinc-400 mt-4">
          Remembered it?{' '}
          <Link
            href="/login"
            className="text-zinc-200 hover:text-white underline underline-offset-2"
          >
            Back to login
          </Link>
        </p>
      </section>
    </main>
  );
}
