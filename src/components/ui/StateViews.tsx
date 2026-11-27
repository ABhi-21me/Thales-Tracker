import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading content">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-5 w-12 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/70 px-6 py-8 text-center dark:border-amber-900/60 dark:bg-amber-950/30"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-600 dark:text-slate-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
