import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  maxWidthClass?: string;
  fullScreenOnMobile?: boolean;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  maxWidthClass = 'max-w-lg',
  fullScreenOnMobile = false,
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
    ? `m-0 h-dvh max-h-dvh w-full max-w-none rounded-none border-0 sm:m-auto sm:h-auto sm:max-h-[88dvh] sm:w-[calc(100%-2rem)] ${maxWidthClass} sm:rounded-xl sm:border`
    : `m-auto w-[calc(100%-2rem)] ${maxWidthClass} max-h-[88dvh] rounded-xl border`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className={`${sizeClasses} border-slate-200 bg-white p-0 text-slate-900 shadow-xl transition-opacity duration-150 ease-out dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100`}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0 flex-1">
            <h1 id={titleId} className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
            {headerExtra && <div className="mt-2">{headerExtra}</div>}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="-mr-2 -mt-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
