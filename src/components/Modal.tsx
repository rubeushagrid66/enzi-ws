"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Accessible modal shell: role="dialog", Escape to close, focus first field. */
export function Modal({
  title,
  onClose,
  children,
  labelledBy,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  wide?: boolean;
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
        className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-6 my-8`}
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

/** Accessible confirmation dialog (replaces window.confirm). */
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
    <Modal title={title} onClose={onCancel}>
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
