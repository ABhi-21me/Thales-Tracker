import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { isSupabaseConfigured, setRememberDevice, supabase, viewerEmail } from '../lib/supabase';

interface PasscodeGateProps {
  onOpenAdminLogin: () => void;
}

export function PasscodeGate({ onOpenAdminLogin }: PasscodeGateProps) {
  const [passcode, setPasscode] = useState('');
  const [rememberDevice, setRememberDeviceState] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured && Boolean(viewerEmail);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) {
      setError('Enter the shared project passcode.');
      return;
    }

    setLoading(true);
    setError(null);
    setRememberDevice(rememberDevice);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: viewerEmail,
        password: passcode,
      });

      if (authError) {
        setError('Incorrect passcode. Please check with the project team.');
      }
    } catch {
      setError('Network error while signing in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-[#0f172a]">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-base font-medium tracking-tight text-slate-900 dark:text-slate-100">
              Track Thales
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Value Proof Engine · Project Log
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
            <Lock className="h-4 w-4" />
          </div>
        </div>

        {!isConfigured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Supabase environment variables missing</p>
            <p className="mt-1 leading-relaxed">
              Add <code className="font-mono">VITE_SUPABASE_URL</code>,{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>, and{' '}
              <code className="font-mono">VITE_VIEWER_EMAIL</code> to your{' '}
              <code className="font-mono">.env</code> file and restart Vite.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="viewer-passcode"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Shared Viewer Passcode
              </label>
              <input
                id="viewer-passcode"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
              />
            </div>

            <label
              htmlFor="viewer-remember"
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs text-slate-600 select-none sm:min-h-[32px] dark:text-slate-300"
            >
              <input
                id="viewer-remember"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDeviceState(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-600"
              />
              <span>Remember this device</span>
            </label>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {loading ? 'Signing in...' : 'Open Project Log'}
            </button>
          </form>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Read-only viewer access
          </span>
          <button
            type="button"
            onClick={onOpenAdminLogin}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin login
          </button>
        </div>
      </div>
    </div>
  );
}
