import React from "react";
import { X, ChevronRight } from "lucide-react";

/**
 * The finding detail popup — the exact modal the Findings tab shows
 * (title, category pill, linked-ideas count, image, description,
 * sub findings, linked ideas). Shared by the project page and by the
 * idea detail page, so a Related Finding opens the same popup in
 * both places instead of navigating away.
 */
export default function FindingPopup({
  finding,
  onClose,
  onOpenIdea,
  zIndexClass = "z-[110]",
}: {
  finding: any;
  onClose: () => void;
  /** Called when a linked idea is clicked. If omitted, linked ideas
   *  render as plain rows (no navigation). */
  onOpenIdea?: (idea: any) => void;
  zIndexClass?: string;
}) {
  if (!finding) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Finding detail — ${finding.title}`}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">{finding.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-bsi-50 px-2.5 py-0.5 font-bold text-bsi-700">
                {finding.categoryName || "Uncategorized"}
              </span>
              {(finding.linkedIdeas || []).length > 0 && (
                <span>Linked to {(finding.linkedIdeas || []).length} {(finding.linkedIdeas || []).length === 1 ? "idea" : "ideas"}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {finding.imageUrl && (
            <img src={finding.imageUrl} alt={`Image evidence for ${finding.title}`} className="h-auto w-full rounded-xl border border-slate-200 object-contain" />
          )}
          {finding.description && String(finding.description).trim() !== "" ? (
            <p className="text-sm leading-relaxed text-slate-700">{finding.description}</p>
          ) : (
            <p className="text-sm text-slate-500">No description yet.</p>
          )}
          {finding.fitur && String(finding.fitur).trim() !== "" && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Fitur</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{finding.fitur}</p>
            </div>
          )}
          {finding.verbatimEvidence && String(finding.verbatimEvidence).trim() !== "" && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Verbatim Evidence</p>
              <blockquote className="mt-2 rounded-xl border-l-4 border-gold-400 bg-gold-50/40 px-4 py-3 text-sm italic leading-relaxed text-slate-700">
                &ldquo;{finding.verbatimEvidence}&rdquo;
              </blockquote>
            </div>
          )}
          {(finding.subFindings || []).filter((s: any) =>
            (s.fitur && String(s.fitur).trim() !== "") ||
            (s.description && String(s.description).trim() !== "") ||
            (s.images || []).length > 0
          ).length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sub findings</p>
              <div className="mt-2 space-y-3">
                {(finding.subFindings || []).filter((s: any) =>
                  (s.fitur && String(s.fitur).trim() !== "") ||
                  (s.description && String(s.description).trim() !== "") ||
                  (s.images || []).length > 0
                ).map((s: any, si: number) => (
                  <div key={s.id || si} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Sub Finding {si + 1}{s.fitur ? ` — ${s.fitur}` : ""}
                    </p>
                    {s.description && String(s.description).trim() !== "" && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.description}</p>
                    )}
                    {(s.images || []).map((im: any, ii: number) => (
                      <figure key={ii} className="mt-2">
                        <img src={im.image_url} alt={`Sub finding ${si + 1} evidence ${ii + 1}`} className="h-auto w-full rounded-lg border border-slate-200 object-contain" />
                        {im.description && String(im.description).trim() !== "" && (
                          <figcaption className="mt-1 text-xs text-slate-500">{im.description}</figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(finding.linkedIdeas || []).length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Linked ideas</p>
              <ul className="mt-2 space-y-1.5">
                {(finding.linkedIdeas || []).map((li: any) => (
                  <li key={li.id}>
                    {onOpenIdea ? (
                      <button
                        type="button"
                        onClick={() => onOpenIdea(li)}
                        className="group flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-bsi-300 hover:bg-bsi-50/60 hover:text-bsi-700"
                      >
                        <span className="min-w-0">{li.title}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-bsi-600" />
                      </button>
                    ) : (
                      <span className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-700">
                        <span className="min-w-0">{li.title}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
