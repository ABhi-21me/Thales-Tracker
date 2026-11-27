import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { setRememberDevice, supabase } from '../lib/supabase';
import { useToast } from './ui/Toast';

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminLoginModal({ open, onClose, onSuccess }: AdminLoginModalProps) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDeviceState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    setRememberDevice(rememberDevice);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.user?.app_metadata?.role !== 'admin') {
        await supabase.auth.signOut();
        setError('This account does not have admin permissions.');
      } else {
        setPassword('');
        showToast('Signed in as Admin', 'success');
        onSuccess();
        onClose();
      }
    } catch {
      setError('Unable to reach authentication service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Admin Sign In"
      subtitle="Authenticated with Supabase Auth (no self-signup)"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Admin Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoFocus
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@university.edu"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <label
          htmlFor="admin-remember"
          className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs text-slate-600 select-none sm:min-h-[32px] dark:text-slate-300"
        >
          <input
            id="admin-remember"
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
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
