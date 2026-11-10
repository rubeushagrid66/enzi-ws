"use client";

import React, { useEffect, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

/**
 * Form page shell. Admin input forms used to open in a small centered
 * popup (max-w-md, 90vh) — too cramped for long forms (the Idea form
 * has a Scope table, sub findings with images, and a dozen fields).
 * By default a Modal now renders as a full-screen dedicated form page:
 * a sticky header with a back button, and the form in a roomy centered
 * column that scrolls like a normal page. Pass variant="dialog" for
 * small confirmations (ConfirmDialog), which stay a centered popup.
 * Escape closes, and the first field is focused on open.
 */
export function Modal({
  title,
  onClose,
  children,
  labelledBy,
  wide,
  variant = "page",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  wide?: boolean;
  variant?: "page" | "dialog";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = labelledBy || `modal-title-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  // Callers pass inline `onClose` arrows, so its identity changes on
  // every render. Keep the latest one in a ref and run the open-once
  // effect a single time — otherwise every keystroke in any field
  // re-ran the effect and yanked focus back to the first field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    // Focus the first focusable field once, when the dialog opens.
    const el = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([data-close])"
    );
    el?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (variant === "dialog") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-6 my-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <h3 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              data-close
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  // Full-screen form page. `wide` (the Idea/Finding forms) gets the
  // wider column so the Scope table and sub findings breathe; the
  // smaller forms (Group, Aspect, User, Project) use the narrower one.
  const contentWidth = wide ? "max-w-4xl" : "max-w-2xl";
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 overflow-y-auto bg-white"
    >
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className={`mx-auto flex w-full ${contentWidth} items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h3 id={titleId} className="min-w-0 flex-1 truncate text-center text-base font-bold text-slate-900 sm:text-lg">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-close
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>
      <div className={`mx-auto w-full ${contentWidth} px-4 py-6 sm:px-6 sm:py-8`}>
        {children}
      </div>
    </div>
  );
}

/** Accessible confirmation dialog (replaces window.confirm). Stays a
 * small centered popup — a confirmation is not an input form. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} variant="dialog">
      <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
      <div className="flex items-center justify-end gap-2 pt-5">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className="btn-danger"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
