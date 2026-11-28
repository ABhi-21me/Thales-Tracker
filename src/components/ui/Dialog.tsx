import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  fullScreenOnMobile?: boolean;
  titleSizeClass?: string;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  headerExtra,
  footer,
  maxWidthClass = 'max-w-lg',
  fullScreenOnMobile = false,
  titleSizeClass = 'text-base font-semibold',
  bodyRef,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    pressedOutsideRef.current = isOutside(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (pressedOutsideRef.current && isOutside(e)) {
      dialogRef.current?.close();
    }
    pressedOutsideRef.current = false;
  };

  if (!open) {
    return null;
  }

  const sizeClasses = fullScreenOnMobile
    ? `m-0 h-dvh max-h-dvh w-full max-w-none rounded-none border-0 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:w-full ${maxWidthClass} sm:rounded-2xl sm:border`
    : `m-auto w-[calc(100%-2rem)] ${maxWidthClass} max-h-[90vh] rounded-2xl border`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className={`${sizeClasses} border-slate-200 bg-white p-0 text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100`}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white px-6 py-5 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1
                id={titleId}
                className={`${titleSizeClass} tracking-tight text-slate-900 dark:text-slate-100`}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{subtitle}</p>
              )}
            </div>
            <div className="no-print flex shrink-0 items-center gap-1">
              {headerActions}
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Close dialog"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] sm:min-w-[36px] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {headerExtra && <div className="mt-2.5">{headerExtra}</div>}
        </header>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-6 sm:p-8">
          {children}
        </div>

        {footer && (
          <footer className="no-print sticky bottom-0 z-20 shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
