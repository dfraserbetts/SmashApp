'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { supabaseClient } from '@/lib/supabaseClient';

const MIN_PASSWORD_LENGTH = 6;
const INVALID_RESET_LINK_MESSAGE =
  'Invalid or expired reset link. Please request a new reset email.';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      setErr(null);
      setCheckingSession(true);

      try {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        let recoveryLinkAccepted = false;

        if (code) {
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
          recoveryLinkAccepted = true;
          window.history.replaceState({}, document.title, '/auth/update-password');
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const hashType = hashParams.get('type');
        if (accessToken && refreshToken && hashType === 'recovery') {
          const { error } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          recoveryLinkAccepted = true;
          window.history.replaceState({}, document.title, '/auth/update-password');
        }

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        if (!cancelled) {
          const validRecoverySession = recoveryLinkAccepted && Boolean(data.session);
          setHasRecoverySession(validRecoverySession);
          if (!validRecoverySession) {
            setErr(INVALID_RESET_LINK_MESSAGE);
          }
        }
      } catch {
        if (!cancelled) {
          setHasRecoverySession(false);
          setErr(INVALID_RESET_LINK_MESSAGE);
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setMessage(null);

    if (!hasRecoverySession) {
      setErr(INVALID_RESET_LINK_MESSAGE);
      return;
    }

    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErr(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error } = await supabaseClient.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setMessage('Password updated. You can now log in with your new password.');
    await supabaseClient.auth.signOut();
    window.setTimeout(() => router.replace('/login'), 1500);
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
      <section className="border border-zinc-800 rounded-xl p-8 max-w-md w-full bg-zinc-950">
        <h1 className="text-xl font-semibold mb-1">Choose New Password</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Enter a new password for your SMASH account.
        </p>

        {checkingSession ? (
          <p className="text-sm text-zinc-400">Checking reset link...</p>
        ) : hasRecoverySession ? (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm text-zinc-300">New Password</span>
              <input
                type="password"
                name="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                disabled={!hasRecoverySession || loading}
                className="px-3 py-2 rounded-lg bg-black border border-zinc-800 disabled:opacity-60"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-zinc-300">Confirm New Password</span>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                disabled={!hasRecoverySession || loading}
                className="px-3 py-2 rounded-lg bg-black border border-zinc-800 disabled:opacity-60"
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
              disabled={!hasRecoverySession || loading}
              className="mt-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-red-400 border border-red-900/40 bg-red-950/20 rounded-lg p-2">
            {err ?? INVALID_RESET_LINK_MESSAGE}
          </p>
        )}

        <p className="text-sm text-zinc-400 mt-4">
          Need another reset link?{' '}
          <Link
            href="/auth/forgot-password"
            className="text-zinc-200 hover:text-white underline underline-offset-2"
          >
            Start again
          </Link>
        </p>
        <p className="text-sm text-zinc-400 mt-2">
          Back to{' '}
          <Link
            href="/login"
            className="text-zinc-200 hover:text-white underline underline-offset-2"
          >
            login
          </Link>
        </p>
      </section>
    </main>
  );
}
