"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  Users2,
  Compass,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import FeasibilityMatrix from "./FeasibilityMatrix";
import ViabilityVoteMatrix from "./ViabilityVoteMatrix";
import FindingPopup from "./FindingPopup";
import { groupAverageScores, normalizeFramework, findingBoardPositionForScores, calculateDVFScore, type FeasibilityQuadrant, type WeightInput } from "@/lib/scoring";

// Quadrant display names + what they mean, shared by the Matrix score
// box and the board. The Matrix box shows the quadrant the finding
// lands in — not the F number — because that is what "Matrix" means.
const QUADRANT_LABEL: Record<FeasibilityQuadrant, { title: string; detail: string }> = {
  QUICK_WINS: { title: "Quick Wins", detail: "High Impact, Low Effort" },
  BIG_BETS: { title: "Big Bets", detail: "High Impact, High Effort" },
  FILL_INS: { title: "Fill-ins", detail: "Low Impact, Low Effort" },
  AVOID: { title: "Avoid", detail: "Low Impact, High Effort" },
};

interface FindingDetailViewProps {
  finding: any;
  allFindings: any[];
  project: any;
  isAdmin: boolean;
  currentUser?: { id?: string; name: string; role: string } | null;
  meId?: string | null;
}

// ── Finding chip label: cap at 40 characters with an ellipsis so
// a long finding title never stretches the chip across the page.
// The full title stays in the tooltip and in the popup itself.
const chipLabel = (s: string) =>
  s.length > 40 ? `${s.slice(0, 40).trimEnd()}…` : s;

export default function FindingDetailView({
  finding,
  allFindings,
  project,
  isAdmin,
  currentUser,
  meId,
}: FindingDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"desirability" | "viability" | "feasibility">(
    "desirability"
  );
  // About section is collapsed by default so a scorer lands straight
  // on the score summary + scoring tabs without scrolling past the
  // (often long) idea content. Tap the header to expand it.
  const [aboutOpen, setAboutOpen] = useState(false);
  const [localFinding, setLocalFinding] = useState(finding);

  // ── Survey D bracket (global, from the Framework tab) ──────────
  // The live preview below must use the same thresholds as the server.
  // Defaults match the Scoring DVF - D sheet (3 / 6 / ignore-0) until
  // the fetch returns; a failed fetch keeps the defaults. The bracket
  // is per-project (2026-11-17), so it is fetched for this project.
  const [surveyBracket, setSurveyBracket] = useState<{ score2Min: number; score3Min: number; zeroBehavior: 1 | 2 }>({
    score2Min: 3,
    score3Min: 6,
    zeroBehavior: 2,
  });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/global/survey-bracket?project=${encodeURIComponent(project.slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.bracket) {
          setSurveyBracket({
            score2Min: Number(data.bracket.score2Min) || 3,
            score3Min: Number(data.bracket.score3Min) || 6,
            zeroBehavior: Number(data.bracket.zeroBehavior) === 1 ? 1 : 2,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.slug]);

  // ── Related ideas ────────────────────────────────────────────────
  // Ideas linked to this finding (assigned in the admin Ideas tab).
  // Shown under the header so the finding's ideas are visible at a
  // glance, whatever tab is open.
  const [relatedIdeas, setRelatedIdeas] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${project.slug}/findings/${finding.id}/ideas`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setRelatedIdeas(data?.ideas || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [finding.id, project.slug]);

  // ── Related-finding popup ────────────────────────────────────────
  // Clicking a Related Finding opens the SAME finding popup the
  // Findings tab shows (title, category, image, description, sub
  // findings, linked ideas) as a modal over this detail page — it
  // does not navigate away. The full finding (with sub findings and
  // linked ideas, plus its category name from the group) comes from
  // project.findingsByCategory, which this page already receives;
  // a finding from another project falls back to the light row data
  // (Uncategorized, linked to this idea only).
  const router = useRouter();
  const [popupFinding, setPopupFinding] = useState<any | null>(null);
  const findingById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const g of project?.findingsByCategory || []) {
      for (const f of g.findings || []) {
        map[f.id] = { ...f, categoryName: g.categoryName };
      }
    }
    return map;
  }, [project?.findingsByCategory]);
  const openRelatedFinding = (idea: any) => {
    const full = findingById[idea.id];
    setPopupFinding(
      full || {
        ...idea,
        categoryName: "Uncategorized",
        subFindings: [],
        linkedIdeas: [{ id: finding.id, title: finding.title }],
      }
    );
  };
  useEffect(() => {
    if (!popupFinding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopupFinding(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupFinding]);

  // ── Idea scope: role-based, not group-based ──────────────────────
  // Ideas are assigned to ROLES, not groups: every role scores the
  // same idea, but only on its own label's aspects (Business & Ops
  // scores BizOps aspects, Product scores Product aspects, Tech
  // scores Tech aspects — the vote API enforces it). So there is ONE
  // view of an idea: V/F and DVF are the combination of all roles'
  // contributions, and there is no group to switch between. The
  // group chips are gone. `myGroupId` is kept only so the V&F matrix
  // knows the viewer's own role (for the label gate).
  const groups = (project.groups || []).filter((g: any) => g.isActive !== false);
  const myGroupId =
    groups.find((g: any) =>
      (g.participants || []).some((p: any) => p.id === meId)
    )?.id ?? null;
  // Every scorer in the project (all groups, admin/facilitator
  // excluded): each participant only scores their own role's aspects,
  // so averaging across all of them gives the idea's overall V/F.
  // The viewer's own participant id is always included: ADMIN /
  // FACILITATOR score as themselves in any group, so their vote counts
  // in the idea's V/F even though their row lives in only one group.
  const groupParticipantIds: string[] = [
    ...groups.flatMap((g: any) => (g.participants || []))
      .filter((p: any) => p.isActive !== false && p.roleTitle !== "ADMIN" && p.roleTitle !== "FACILITATOR")
      .map((p: any) => p.id),
    ...(meId ? [meId] : []),
  ];
  // The idea's values. V/F are the average of all participants who
  // scored that dimension (1 decimal); a dimension nobody scored is
  // null. D is the finding's research score — it comes from the
  // research mention counts alone (count-based, no basis N), NOT from
  // any group's votes, so it is the same for every viewer. A role's
  // V/F only reflects the aspects its members may score (their
  // group's assigned role), because the vote API only lets them vote
  // on those aspects.
  const groupVF = groupAverageScores(
    localFinding.scores?.participantScores,
    groupParticipantIds
  );
  const groupD = localFinding.scores?.desirability ?? null;
  const groupV = groupVF.viability;
  const groupF = groupVF.feasibility;
  // The quadrant this idea lands in on the board (from its D/V/F —
  // a manual pin wins, same as the board). This is what the Matrix
  // score box shows: the quadrant name, not the F number.
  const groupBoardPos = findingBoardPositionForScores(localFinding, groupD, groupV, groupF);
  const groupQuadrant = groupBoardPos.quadrant;

  // Framework weights for the DVF Score (global, from Framework &
  // Weighting — today 33/33/33). Fetched once; the equal-thirds
  // fallback keeps the score right before the fetch lands.
  const [weights, setWeights] = useState<WeightInput[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/global/weights", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.weights?.length) setWeights(data.weights);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  // DVF Score for the IDEA: the weighted composite of this idea's
  // D, V and F (all roles combined). Null (shown as N/A) while any
  // dimension is unscored.
  const groupDVF = calculateDVFScore(groupD, groupV, groupF, weights ?? [
    { name: "Desirability", weight: 33 },
    { name: "Viability", weight: 33 },
    { name: "Feasibility", weight: 33 },
  ]);

  // Research mention inputs (local until saved). Synced when a different
  // finding is opened; typing is never clobbered by a background refresh.
  // NOTE (aturan D baru, 2026-11-16): D dihitung dari jumlah mentah
  // saja (perusahaan untuk Interview, responden untuk Survei) — basis
  // N (Total) tidak lagi dipakai dalam perhitungan, jadi tidak ada
  // input Total di seksi ini. Total proyek masih tersimpan di database
  // dan bisa diubah dari dashboard (Framework & Weighting).
  // NOTE (auto interview, 2026-11-17): the Interview count defaults
  // to the auto value from linked interview findings (distinct
  // companies — interviewMentionsAuto from the API, null when no
  // interview finding is linked). The stored interviewMentions is the
  // manual override and wins when set. The input shows the effective
  // value (stored ?? auto); saving an untouched auto value keeps it
  // automatic (null is sent), so it keeps following the links.
  const autoInterviewMentions =
    localFinding.interviewMentionsAuto != null
      ? Number(localFinding.interviewMentionsAuto)
      : null;
  const effectiveInterviewMentions =
    localFinding.interviewMentions != null
      ? Number(localFinding.interviewMentions)
      : autoInterviewMentions;
  const [interviewInput, setInterviewInput] = useState<string>(
    effectiveInterviewMentions != null ? String(effectiveInterviewMentions) : ""
  );
  // True once the admin edits the Interview field — used on save so
  // an untouched auto value is not locked in as a manual override.
  const [interviewDirty, setInterviewDirty] = useState(false);
  // Survey mirrors Interview: the count defaults to the auto sum of
  // linked findings' penyebutan_survey (surveyMentionsAuto from the
  // API, null when nothing is linked). Stored surveyMentions is the
  // manual override and wins when set.
  const autoSurveyMentions =
    localFinding.surveyMentionsAuto != null
      ? Number(localFinding.surveyMentionsAuto)
      : null;
  const effectiveSurveyMentions =
    localFinding.surveyMentions != null
      ? Number(localFinding.surveyMentions)
      : autoSurveyMentions;
  const [surveyInput, setSurveyInput] = useState<string>(
    effectiveSurveyMentions != null ? String(effectiveSurveyMentions) : ""
  );
  const [surveyDirty, setSurveyDirty] = useState(false);
  const [researchSaving, setResearchSaving] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  React.useEffect(() => {
    setInterviewInput(
      localFinding.interviewMentions != null
        ? String(localFinding.interviewMentions)
        : localFinding.interviewMentionsAuto != null
          ? String(localFinding.interviewMentionsAuto)
          : ""
    );
    setInterviewDirty(false);
    setSurveyInput(
      localFinding.surveyMentions != null
        ? String(localFinding.surveyMentions)
        : localFinding.surveyMentionsAuto != null
          ? String(localFinding.surveyMentionsAuto)
          : ""
    );
    setSurveyDirty(false);
    setResearchStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFinding.id]);

  const scores = localFinding.scores || {};
  const desirability = scores.desirabilityDetails || {};

  // Score summary — the idea's verdict at a glance, shown once in
  // the hero (not repeated inside every tab). DVF is the headline;
  // D, V and F are the 1–3 scores; Position is the board quadrant the
  // idea lands in (a manual pin wins, same as the board).
  const scoreSummary = (
    <div className="mt-5 grid auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-5">
      <div className="rounded-xl border border-gold-200 bg-gold-50 px-3.5 py-3">
        <div className="text-xs font-bold uppercase tracking-wider text-gold-700">
          DVF Score
        </div>
        <div className="mt-0.5 text-2xl font-extrabold leading-none text-gold-800">
          {groupDVF != null ? groupDVF.toFixed(2) : "N/A"}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-gold-700">
          Skor gabungan menggunakan bobot (wD: 33%, wV: 33%, wF: 33%)
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gold-700">
          Rumus DVF: (wD × D) + (wV × V) + (wF × F)
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Desirability
        </div>
        <div className="mt-0.5 text-2xl font-bold leading-none text-slate-900">
          {groupD != null ? (
            <>
              {groupD}
              <span className="text-sm font-medium text-slate-600"> / 3</span>
            </>
          ) : (
            "N/A"
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Berdasarkan data riset
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Viability
        </div>
        <div className="mt-0.5 text-2xl font-bold leading-none text-slate-900">
          {groupV != null ? (
            <>
              {groupV}
              <span className="text-sm font-medium text-slate-600"> / 3</span>
            </>
          ) : (
            "N/A"
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Rata-rata skor seluruh kelompok
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Feasibility
        </div>
        <div className="mt-0.5 text-2xl font-bold leading-none text-slate-900">
          {groupF != null ? (
            <>
              {groupF}
              <span className="text-sm font-medium text-slate-600"> / 3</span>
            </>
          ) : (
            "N/A"
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Rata-rata skor seluruh kelompok
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Impact vs Effort Matrix Position
        </div>
        <div className="mt-0.5 text-2xl font-bold leading-none text-slate-900">
          {groupQuadrant ? QUADRANT_LABEL[groupQuadrant].title : "N/A"}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {groupQuadrant
            ? QUADRANT_LABEL[groupQuadrant].detail
            : "Not placed yet"}
        </p>
      </div>
    </div>
  );

  // ── About this idea ────────────────────────────────────────────
  // The idea's content (Tujuan, Scope table, Output, Tujuan Bisnis)
  // — the same detail fields the admin form collects and the popup
  // shows. The detail page never showed them, so a reader only had
  // the title + description. Only filled fields render; the whole
  // section hides when the idea has no detail yet.
  const scopeRows = [
    {
      label: "Siapa",
      hint: "Peran atau pengguna",
      termasuk: localFinding.roleUsers,
      tidak: localFinding.roleUsersTidakTermasuk,
    },
    {
      label: "Di mana",
      hint: "Langkah, fitur, layar",
      termasuk: localFinding.stepFeatureScreen,
      tidak: localFinding.stepTidakTermasuk,
    },
    {
      label: "Apa yang berubah",
      hint: "Tampilan, alur, sistem",
      termasuk: localFinding.apaYangBerubah,
      tidak: localFinding.apaYangBerubahTidakTermasuk,
    },
  ].filter((r) => (r.termasuk && String(r.termasuk).trim()) || (r.tidak && String(r.tidak).trim()));
  const objectiveNames: string[] = Array.isArray(localFinding.tujuanBisnisNames)
    ? localFinding.tujuanBisnisNames.filter((n: any) => typeof n === "string" && n.trim())
    : [];
  const hasDetailContent =
    (localFinding.tujuan && String(localFinding.tujuan).trim()) ||
    scopeRows.length > 0 ||
    (localFinding.outputKeberhasilan && String(localFinding.outputKeberhasilan).trim()) ||
    objectiveNames.length > 0 ||
    (localFinding.tujuanBisnis && String(localFinding.tujuanBisnis).trim());

  // Interview basis: Cash interviewed 3 companies (per the D-rule
  // image, "Interview (Cash, 3 perusahaan)"); DVC interviewed 3
  // companies too (RSIA Sayyidah / Elnusa / Brantas), shown as
  // "Interview (VC, 3 perusahaan)". The 3/2/1 scale is the same in
  // both projects (it is what the server computes). Both projects
  // use the sheet-model D (interview per kartu, survey porsi-weighted,
  // survey only raises D) since 2026-11-23.
  const isCashProject = project.slug === "cash-management-system";
  const isDvcProject = project.slug === "digital-value-chain";
  const isSheetDProject = isCashProject || isDvcProject;

  // Live preview of a source score from a typed count — same rules as
  // the server (aturan D baru, 2026-11-16, count-based, tanpa basis
  // N), with the survey thresholds taken from the global bracket
  // (Framework tab; defaults 3 / 6 / ignore-0): Interview 3
  // perusahaan → 3, 2 → 2, 1 → 1; Survei ≥score3Min responden → 3,
  // ≥score2Min → 2, 1+ → 1 (0 counts as 1 only when the bracket's
  // zeroBehavior is 1). A blank count means that source does not
  // score D. The count is read as a float (not floored): the CMS
  // auto survey value is a porsi-weighted count and can be fractional
  // (e.g. 2.5), and the bracket thresholds are integers, so the float
  // scores exactly like the server does.
  const previewSource = (raw: string, source: "Interview" | "Survei") => {
    const n = raw.trim() === "" ? null : Number(raw);
    if (n == null || !Number.isFinite(n)) {
      return { mentions: n, score: null as number | null };
    }
    if (n <= 0) {
      if (source === "Survei" && n === 0 && surveyBracket.zeroBehavior === 1) {
        return { mentions: n, score: 1 as number | null };
      }
      return { mentions: n, score: null as number | null };
    }
    const score =
      source === "Interview"
        ? n >= 3
          ? 3
          : n === 2
            ? 2
            : 1
        : n >= surveyBracket.score3Min
          ? 3
          : n >= surveyBracket.score2Min
            ? 2
            : 1;
    return { mentions: n, score };
  };
  const interviewPreview = previewSource(interviewInput, "Interview");
  const surveyPreview = previewSource(surveyInput, "Survei");
  const previewD = (() => {
    const ss = [interviewPreview, surveyPreview].filter((s) => s.score != null);
    if (ss.length === 0) return null;
    if (ss.length === 1) return ss[0].score;
    const avg = Math.ceil(((ss[0].score as number) + (ss[1].score as number)) / 2);
    // Sheet-model D (Bracket B8=1, CMS and DVC): the survey can only
    // raise D.
    return isSheetDProject ? Math.max(ss[0].score as number, avg) : avg;
  })();

  // Save the research numbers: this finding's mention counts only.
  // (Aturan D baru, 2026-11-16: basis N / Total tidak lagi dipakai
  // dalam perhitungan D, jadi tidak disimpan dari sini.)
  // The response merges into local state like a vote save.
  // Interview auto-keep: when the stored value is null and the admin
  // never edited the field, the shown number is the auto value from
  // linked findings — send null so it stays automatic instead of
  // locking the auto number in as a manual override.
  const handleSaveResearch = async () => {
    setResearchSaving(true);
    setResearchStatus(null);
    try {
      const interviewToSave =
        !interviewDirty && localFinding.interviewMentions == null
          ? null
          : interviewInput.trim() === ""
            ? null
            : Math.floor(Number(interviewInput));
      const surveyToSave =
        !surveyDirty && localFinding.surveyMentions == null
          ? null
          : surveyInput.trim() === ""
            ? null
            : Math.floor(Number(surveyInput));
      const res = await fetch(
        `/api/projects/${project.slug}/findings/${localFinding.id}/research`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewMentions: interviewToSave,
            surveyMentions: surveyToSave,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      if (data.finding) {
        setLocalFinding((prev: any) => ({
          ...prev,
          interviewMentions: data.finding.interviewMentions ?? null,
          interviewMentionsAuto:
            data.finding.interviewMentionsAuto ?? prev.interviewMentionsAuto ?? null,
          surveyMentions: data.finding.surveyMentions ?? null,
          surveyMentionsAuto:
            data.finding.surveyMentionsAuto ?? prev.surveyMentionsAuto ?? null,
          scoringStatus: data.finding.scoringStatus ?? prev.scoringStatus,
          scores: { ...prev.scores, ...(data.finding.scores || {}) },
        }));
        setInterviewDirty(false);
        setSurveyDirty(false);
      }
      setResearchStatus("Research mentions saved — Desirability updated.");
    } catch (e: any) {
      setResearchStatus(e.message || "Failed to save research numbers.");
    } finally {
      setResearchSaving(false);
    }
  };

  // Scores update local state only. The viewer list refreshes when
  // navigating back (focus refresh + server revalidation on save).
  const handleVotesChanged = (updatedF: any) => {
    setLocalFinding(updatedF);
  };

  const handleFeasibilitySaved = (updatedData: any) => {
    setLocalFinding((prev: any) => ({
      ...prev,
      ...updatedData,
    }));
  };

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {/* ── Hero: identity + verdict ── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-bsi-100 text-bsi-800 border border-bsi-200">
              Idea Detail
            </span>
            {groupQuadrant && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {QUADRANT_LABEL[groupQuadrant].title}
              </span>
            )}
          </div>
          <h2 id="finding-detail-title" className="mt-3 font-sans text-2xl font-bold text-slate-900 leading-tight sm:text-[2rem]">
            {localFinding.title}
          </h2>
          {localFinding.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              {localFinding.description}
            </p>
          )}

          {/* Tags list */}
          {localFinding.tagsList && localFinding.tagsList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {localFinding.tagsList.map((tag: any, idx: number) => (
                <span
                  key={idx}
                  className="chip chip-neutral"
                >
                  <span className="text-slate-600 font-normal">{tag.category}:</span>
                  <span className="font-semibold">{tag.value}</span>
                </span>
              ))}
            </div>
          )}

          {/* Related findings — the findings this idea is linked to
              (assigned in the admin Findings tab). Compact pills in a
              wrapping row, so many linked findings stay one or two
              lines tall instead of a tall card each. Full description
              is in the tooltip. */}
          {relatedIdeas.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                Related Findings ({relatedIdeas.length})
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {relatedIdeas.map((idea: any) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => openRelatedFinding(idea)}
                    title={idea.description ? `${idea.title} — ${idea.description}` : idea.title}
                    className="chip chip-bsi transition hover:border-bsi-300 hover:bg-bsi-100"
                  >
                    <span className="truncate text-sm font-semibold text-bsi-900">{chipLabel(idea.title || "")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {scoreSummary}
        </div>
      </section>

      {/* ── About this idea: the idea's content, so a reader
          understands what it is before scoring it. Only filled
          fields render; the section hides when nothing is filled.
          Collapsed by default so a scorer lands straight on the
          score summary + scoring tabs without scrolling. ── */}
      {hasDetailContent && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setAboutOpen((v) => !v)}
            aria-expanded={aboutOpen}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bsi-500 sm:px-7"
          >
            <span className="text-sm font-bold text-slate-900">About this idea</span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-600">
              {aboutOpen ? "Hide" : "Show"}
              <ChevronDown
                className={`h-4 w-4 text-slate-600 transition-transform ${aboutOpen ? "rotate-180" : ""}`}
              />
            </span>
          </button>

          {aboutOpen && (
          <div className="border-t border-slate-200 px-5 pb-5 pt-4 sm:px-7 sm:pb-7">

            {localFinding.tujuan && String(localFinding.tujuan).trim() && (
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">Tujuan</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{localFinding.tujuan}</p>
              </div>
            )}

            {scopeRows.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">Scope</h4>
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                  <div className="hidden sm:grid sm:grid-cols-[7rem_1fr_1fr] bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <div className="px-3 py-2" />
                    <div className="px-3 py-2 text-bsi-700">Termasuk</div>
                    <div className="px-3 py-2 border-l border-slate-200 text-gold-700">Tidak Termasuk</div>
                  </div>
                  {scopeRows.map((row) => (
                    <div key={row.label} className="grid border-t border-slate-200 first:border-t-0 sm:grid-cols-[7rem_1fr_1fr]">
                      <div className="px-3 pt-2.5 sm:py-3">
                        <p className="text-sm font-semibold text-slate-800">{row.label}</p>
                        <p className="text-sm leading-relaxed text-slate-600">{row.hint}</p>
                      </div>
                      <div className="px-3 pt-1 pb-2.5 sm:py-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-bsi-700 sm:hidden">Termasuk</p>
                        <p className="text-sm leading-relaxed text-slate-700">{row.termasuk || "—"}</p>
                      </div>
                      <div className="px-3 pb-2.5 sm:py-3 sm:border-l sm:border-slate-200">
                        <p className="text-xs font-bold uppercase tracking-wider text-gold-700 sm:hidden">Tidak Termasuk</p>
                        <p className="text-sm leading-relaxed text-slate-700">{row.tidak || "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {localFinding.outputKeberhasilan && String(localFinding.outputKeberhasilan).trim() && (
              <div className="mt-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">Output Keberhasilan</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{localFinding.outputKeberhasilan}</p>
              </div>
            )}

            {/* Business objectives render as gold pills (same style as
                the dropdown); findings written before the dropdown keep
                their old free text as a fallback. */}
            {objectiveNames.length > 0 ? (
              <div className="mt-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">Tujuan Bisnis</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {objectiveNames.map((name: string) => (
                    <span key={name} className="inline-flex items-center rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 text-xs font-bold text-gold-800">{name}</span>
                  ))}
                </div>
              </div>
            ) : localFinding.tujuanBisnis && String(localFinding.tujuanBisnis).trim() ? (
              <div className="mt-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">Tujuan Bisnis</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{localFinding.tujuanBisnis}</p>
              </div>
            ) : null}
          </div>
          )}
        </section>
      )}

      {/* ── Scoring ── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6">
          {/* Segmented tab bar — three short labels with a score
              badge each; the pill background keeps it one tidy row
              on mobile instead of wrapping tabs. */}
          <div className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1" role="tablist" aria-label="Scoring dimensions">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "desirability"}
              onClick={() => setActiveTab("desirability")}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold transition ${activeTab === "desirability" ? "bg-white text-bsi-700 shadow-sm" : "text-slate-600 hover:text-slate-700"}`}
            >
              <Target className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="truncate">Desirability</span>
              <span className="shrink-0 rounded-full bg-bsi-100 px-1.5 py-0.5 text-xs font-bold text-bsi-800">
                {groupD != null ? groupD : "N/A"}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "viability"}
              onClick={() => setActiveTab("viability")}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold transition ${activeTab === "viability" ? "bg-white text-bsi-700 shadow-sm" : "text-slate-600 hover:text-slate-700"}`}
            >
              <Users2 className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="truncate">Viability &amp; Feasibility</span>
              <span className="shrink-0 rounded-full bg-bsi-100 px-1.5 py-0.5 text-xs font-bold text-bsi-800">
                {groupV != null ? `${groupV} / 3` : "N/A"}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "feasibility"}
              onClick={() => setActiveTab("feasibility")}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold transition ${activeTab === "feasibility" ? "bg-white text-bsi-700 shadow-sm" : "text-slate-600 hover:text-slate-700"}`}
            >
              <Compass className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="truncate">Matrix</span>
              <span className="shrink-0 rounded-full bg-bsi-100 px-1.5 py-0.5 text-xs font-bold text-bsi-800">
                {groupQuadrant ? QUADRANT_LABEL[groupQuadrant].title : "N/A"}
              </span>
            </button>
          </div>

          <div className="mt-5">
          {/* TAB 1: DESIRABILITY */}
          {activeTab === "desirability" && (
            <div className="space-y-6">

              {/* Research mentions — the only input to D */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <HelpCircle className="h-4 w-4 text-bsi-600" />
                  <span>Jumlah penyebutan dalam riset</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  D dihitung hanya berdasarkan jumlah penyebutan dalam riset: perusahaan untuk Interview, responden untuk Survei. Tidak ada basis total — skor berasal dari angka mentahnya saja.
                </p>
                {isSheetDProject ? (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Angka Interview terisi otomatis dari findings interview yang ter-link ke ide ini — dihitung per kartu yang disentuh: satu pain point yang ter-link menghitung semua perusahaan yang menyebut kartu tersebut. Angka Survei terisi otomatis dari responden survei yang menyebut tema dari findings interview yang ter-link, dibobot porsi (responden bisa bernilai pecahan, mis. 2,5). Angka bisa diubah manual — mengosongkannya mengembalikan ke hitungan otomatis.
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Angka Interview terisi otomatis dari findings interview yang ter-link ke ide ini (jumlah perusahaan yang berbeda). Angka Survei terisi otomatis dari jumlah penyebutan survei findings yang ter-link. Angka bisa diubah manual — mengosongkannya mengembalikan ke hitungan otomatis.
                  </p>
                )}

                {/* Interview */}
                <div className="mt-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      {isCashProject ? "Interview (Cash, 3 perusahaan)" : "Interview (VC, 3 perusahaan)"}
                    </span>
                    <span className="text-sm text-slate-600">3 perusahaan menyebutkan &rarr; 3 &middot; 2 perusahaan menyebutkan &rarr; 2 &middot; 1 perusahaan menyebutkan &rarr; 1</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="field-label whitespace-nowrap">Mentioned by</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={interviewInput}
                        onChange={(e) => { setInterviewInput(e.target.value); setInterviewDirty(true); }}
                        placeholder="e.g. 2"
                        disabled={!isAdmin}
                        title={
                          isAdmin
                            ? "How many companies mentioned this idea in interviews"
                            : "Only an admin can change the research numbers"
                        }
                        className="input w-24"
                      />
                    </label>
                    <span className="ml-auto flex items-baseline gap-2 pb-2">
                      <span className="text-sm text-slate-600">perusahaan</span>
                      <span className="text-sm font-bold text-bsi-700">
                        {interviewPreview.score != null ? `Score ${interviewPreview.score} / 3` : "—"}
                      </span>
                    </span>
                  </div>
                  {localFinding.interviewMentions == null && autoInterviewMentions != null && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {isSheetDProject
                        ? "Otomatis dari findings interview yang ter-link ke ide ini, dihitung per kartu yang disentuh — ubah angkanya untuk override manual."
                        : "Otomatis dari findings interview yang ter-link ke ide ini — ubah angkanya untuk override manual."}
                    </p>
                  )}
                </div>

                {/* Survey */}
                <div className="mt-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">Survei, jawaban dari open questions</span>
                    <span className="text-sm text-slate-600">{surveyBracket.score3Min} responden atau lebih &rarr; 3 &middot; {surveyBracket.score2Min} sampai {surveyBracket.score3Min - 1} responden &rarr; 2{surveyBracket.score2Min > 1 ? <> &middot; 1 sampai {surveyBracket.score2Min - 1} responden &rarr; 1</> : null}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="field-label whitespace-nowrap">Mentioned by</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={surveyInput}
                        onChange={(e) => { setSurveyInput(e.target.value); setSurveyDirty(true); }}
                        placeholder="e.g. 40"
                        disabled={!isAdmin}
                        title={
                          isAdmin
                            ? "How many survey respondents mentioned this idea"
                            : "Only an admin can change the research numbers"
                        }
                        className="input w-24"
                      />
                    </label>
                    <span className="ml-auto flex items-baseline gap-2 pb-2">
                      <span className="text-sm text-slate-600">{isSheetDProject ? "responden berbobot porsi" : "survey respondents"}</span>
                      <span className="text-sm font-bold text-bsi-700">
                        {surveyPreview.score != null ? `Score ${surveyPreview.score} / 3` : "—"}
                      </span>
                    </span>
                  </div>
                  {localFinding.surveyMentions == null && autoSurveyMentions != null && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {isSheetDProject
                        ? "Otomatis dari responden survei yang menyebut tema findings interview yang ter-link, dibobot porsi tema — ubah angkanya untuk override manual."
                        : "Otomatis dari jumlah penyebutan survei findings yang ter-link ke ide ini — ubah angkanya untuk override manual."}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    {previewD != null ? (
                      <>Hasil D: <span className="font-extrabold text-bsi-700">{previewD} / 3</span></>
                    ) : (
                      "Enter a count for Interview and/or Survey to score Desirability."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveResearch}
                    disabled={!isAdmin || researchSaving}
                    title={
                      isAdmin ? undefined : "Only an admin can change the research numbers"
                    }
                    className="btn-primary"
                  >
                    {researchSaving ? "Saving\u2026" : "Save research numbers"}
                  </button>
                </div>
                {researchStatus && (
                  <p role="status" className="mt-2 text-sm font-semibold text-bsi-700">
                    {researchStatus}
                  </p>
                )}
              </div>

              {/* How D is built */}
              <div role="note" className="rounded-xl border border-bsi-200 bg-bsi-50 p-4 text-sm text-bsi-800">
                <span className="font-bold">Perhitungan D: </span>
                {desirability.formulaExplanation ||
                  "Belum ada angka riset — masukkan berapa perusahaan (Interview) dan/atau responden (Survei) yang menyebut ide ini."}
              </div>

              {/* Aturan D (dari gambar Scoring DVF - D) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                {isCashProject ? (
                  <>
                    <span className="font-bold">Aturan D: </span>
                    Interview dihitung per kartu yang disentuh — satu pain point yang ter-link menghitung semua perusahaan yang menyebut kartu tersebut. Survei dihitung dari responden yang menyebut tema findings interview yang ter-link, dibobot porsi tema (responden bisa bernilai pecahan). Survei hanya bisa menaikkan D: D = nilai tertinggi antara skor Interview dan rata-rata yang dibulatkan ke atas. Jika hanya ada satu sumber data, gunakan skor dari sumber tersebut.
                    <span className="mt-2 block">
                      Contoh dari sheet: inisiatif yang menyelesaikan 1 pain point C42-1 — pain point-nya sendiri hanya disebut BAZNAS, tapi kartunya (C42) disentuh 2 perusahaan, jadi skor Interview = 2. Responden survei yang menyebut tema RPT-P01 dihitung 0,5 (porsi 1 dari 2 pain point di tema itu), total 1,0 responden berbobot, jadi skor Survei = 1. D = nilai tertinggi antara 2 dan rata-rata (2 + 1) / 2 = 1,5 yang dibulatkan ke atas menjadi 2, jadi D = 2.
                    </span>
                  </>
                ) : isDvcProject ? (
                  <>
                    <span className="font-bold">Aturan D: </span>
                    Interview dihitung per kartu yang disentuh — satu pain point yang ter-link menghitung semua perusahaan yang menyebut kartu tersebut. Survei dihitung dari responden yang menyebut tema findings interview yang ter-link, dibobot porsi tema (responden bisa bernilai pecahan). Survei hanya bisa menaikkan D: D = nilai tertinggi antara skor Interview dan rata-rata yang dibulatkan ke atas. Jika hanya ada satu sumber data, gunakan skor dari sumber tersebut.
                    <span className="mt-2 block">
                      Contoh dari sheet: inisiatif yang menyelesaikan 1 pain point V30-1 — pain point-nya sendiri hanya disebut RSIA Sayyidah, tapi kartunya (V30) disentuh 2 perusahaan, jadi skor Interview = 2. Responden survei yang menyebut tema D-STS-P01 dihitung 1/6 (porsi 1 dari 6 pain point di tema itu), total 0,2 responden berbobot, jadi skor Survei = 1. D = nilai tertinggi antara 2 dan rata-rata (2 + 1) / 2 = 1,5 yang dibulatkan ke atas menjadi 2, jadi D = 2.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold">Aturan D: </span>
                    D = rata-rata skor Interview dan Survey, lalu dibulatkan ke atas. Contoh: 2,5 dibulatkan menjadi 3. Jika hanya ada satu sumber data, gunakan skor dari sumber tersebut.
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VIABILITY */}
          {activeTab === "viability" && (
            <div className="space-y-6">
              <ViabilityVoteMatrix
                project={project}
                finding={localFinding}
                currentUser={currentUser}
                selectedGroupId={myGroupId}
                onVotesChanged={handleVotesChanged}
              />
            </div>
          )}

          {/* TAB 3: FEASIBILITY */}
          {activeTab === "feasibility" && (
            <div className="space-y-6">
              {/* Interactive 2x2 Feasibility Matrix — the idea's overall
                  position (all roles combined), or N/A / unplaced when
                  the idea has no value for a dimension. */}
              <FeasibilityMatrix
                finding={localFinding}
                allFindings={allFindings}
                projectSlug={project.slug}
                isAdmin={isAdmin}
                meId={meId}
                groupScores={{ desirability: groupD, viability: groupV, feasibility: groupF }}
                selectedGroupId={myGroupId}
                groupParticipantIds={groupParticipantIds}
                onPositionSaved={handleFeasibilitySaved}
              />
            </div>
          )}
          </div>
        </div>
      </section>

      {/* Footer note */}
      <div className="px-1 text-sm leading-relaxed text-slate-600">
        <p>Semua skor D, V, dan F menggunakan skala 1–3.</p>
        <ul className="mt-1 list-disc pl-5">
          <li>D (Desirability): Berdasarkan jumlah penyebutan dalam riset (Interview dan Survei), dengan rata-rata dibulatkan ke atas.</li>
          <li>V (Viability): Rata-rata V tiap peserta (V tiap peserta = rata-rata skor aspek Viability-nya). Angka yang sama di header, tabel scoring, kartu group, dan DVF.</li>
          <li>F (Feasibility): Rata-rata F tiap peserta (F tiap peserta = 4 dikurangi rata-rata skor aspek Effort-nya). Angka yang sama di header, tabel scoring, kartu group, dan DVF.</li>
        </ul>
      </div>

      {/* ── Related-finding popup: the same modal the Findings tab
          shows, over this detail page. A linked idea goes to that
          idea's own detail page. ── */}
      {popupFinding && (
        <FindingPopup
          finding={popupFinding}
          onClose={() => setPopupFinding(null)}
          onOpenIdea={(li: any) => router.push(`/${project.slug}/ideas/${li.id}`)}
        />
      )}
    </div>
  );
}
