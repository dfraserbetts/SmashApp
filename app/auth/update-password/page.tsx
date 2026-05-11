'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabaseClient } from '@/lib/supabaseClient';

const MIN_PASSWORD_LENGTH = 6;
const INVALID_RESET_LINK_MESSAGE =
  'Invalid or expired reset link. Please request a new reset email.';
const RECOVERY_CHECK_TIMEOUT_MS = 1500;

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let recoveryEstablished = false;
    let fallbackTimer: number | null = null;
    let unsubscribeRecoveryListener: (() => void) | null = null;

    function cleanupRecoveryListener() {
      unsubscribeRecoveryListener?.();
      unsubscribeRecoveryListener = null;
    }

    function clearRecoveryUrl() {
      window.history.replaceState({}, document.title, '/auth/update-password');
    }

    function acceptRecoverySession(reason: string) {
      recoveryEstablished = true;
      if (cancelled) return;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      cleanupRecoveryListener();
      setDiagnostic(reason);
      setHasRecoverySession(true);
      setErr(null);
      setCheckingSession(false);
    }

    function rejectRecoverySession(reason: string) {
      if (cancelled || recoveryEstablished) return;
      setDiagnostic(reason);
      setHasRecoverySession(false);
      setErr(INVALID_RESET_LINK_MESSAGE);
      setCheckingSession(false);
    }

    async function prepareRecoverySession() {
      setErr(null);
      setDiagnostic(null);
      setCheckingSession(true);

      try {
        const {
          data: { subscription },
        } = supabaseClient.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
          if (event === 'PASSWORD_RECOVERY' && session) {
            acceptRecoverySession('Password recovery session established.');
          }
        });
        unsubscribeRecoveryListener = () => subscription.unsubscribe();
        if (cancelled) {
          cleanupRecoveryListener();
          return;
        }

        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const code = searchParams.get('code');
        const tokenHash = searchParams.get('token_hash');
        const queryType = searchParams.get('type');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const hashType = hashParams.get('type');
        const hashError = hashParams.get('error') ?? searchParams.get('error');

        if (hashError) {
          clearRecoveryUrl();
          cleanupRecoveryListener();
          rejectRecoverySession('Recovery link returned an auth error.');
          return;
        }

        let handledRecoveryParam = false;
        if (code) {
          handledRecoveryParam = true;
          setDiagnostic('Recovery code detected.');
          const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
          clearRecoveryUrl();
          if (data.session) {
            acceptRecoverySession('Recovery code accepted.');
          } else {
            const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError) throw sessionError;
            if (sessionData.session) acceptRecoverySession('Recovery code accepted.');
          }
        }

        if (!recoveryEstablished && tokenHash && queryType === 'recovery') {
          handledRecoveryParam = true;
          setDiagnostic('Recovery token detected.');
          const { data, error } = await supabaseClient.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (error) throw error;
          clearRecoveryUrl();
          if (data.session) {
            acceptRecoverySession('Recovery token accepted.');
          }
        }

        if (!recoveryEstablished && accessToken && refreshToken && hashType === 'recovery') {
          handledRecoveryParam = true;
          setDiagnostic('Recovery hash detected.');
          const { data, error } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          clearRecoveryUrl();
          if (data.session) {
            acceptRecoverySession('Recovery hash accepted.');
          }
        }

        if (recoveryEstablished) {
          cleanupRecoveryListener();
          return;
        }

        fallbackTimer = window.setTimeout(() => {
          cleanupRecoveryListener();
          rejectRecoverySession(
            handledRecoveryParam
              ? 'Recovery parameters were detected, but no recovery session was established.'
              : 'No recovery params detected.',
          );
        }, RECOVERY_CHECK_TIMEOUT_MS);
      } catch (error) {
        if (window.location.hash || window.location.search) {
          clearRecoveryUrl();
        }
        if (!cancelled) {
          setDiagnostic(error instanceof Error ? error.message : 'Recovery link could not be verified.');
          rejectRecoverySession('Recovery link could not be verified.');
        }
      }
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      cleanupRecoveryListener();
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
    setHasRecoverySession(false);
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
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">Checking reset link...</p>
            {diagnostic ? <p className="text-xs text-zinc-500">{diagnostic}</p> : null}
          </div>
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

            {diagnostic && !message ? (
              <p className="text-xs text-zinc-500">{diagnostic}</p>
            ) : null}

            <button
              type="submit"
              disabled={!hasRecoverySession || loading}
              className="mt-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-400 border border-red-900/40 bg-red-950/20 rounded-lg p-2">
              {err ?? INVALID_RESET_LINK_MESSAGE}
            </p>
            {diagnostic ? <p className="text-xs text-zinc-500">{diagnostic}</p> : null}
          </div>
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
