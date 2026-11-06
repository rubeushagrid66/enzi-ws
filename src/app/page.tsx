import Link from "next/link";
import { dbService } from "@/lib/db-service";
import Navbar from "@/components/Navbar";
import {
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Compass,
  Target,
  Users2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await dbService.getProjects();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            <span>Workshop Facilitation & Prioritization Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl mx-auto">
            Prioritize with Confidence using{" "}
            <span className="text-emerald-600">DVF Framework</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Capture user pain points, build multi-level parameter hierarchies, aggregate participant votes, and map 2x2 Feasibility matrices with live DVF scoring.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {projects.length > 0 && (
              <Link
                href={`/${projects[0].slug}`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition shadow-md hover:shadow-lg"
              >
                <span>Explore Live Workshop ({projects[0].name})</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-semibold text-sm hover:bg-slate-50 transition shadow-xs"
            >
              <Shield className="h-4 w-4 text-emerald-600" />
              <span>Admin Dashboard</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Workshop Projects Grid */}
      <main id="main-content" className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Active Workshop Projects
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Select a project below to open its dedicated Result Viewer UI.
              </p>
            </div>
            <Link
              href="/admin"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              <span>Manage in Admin</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project: any) => {
              const weights = project.frameworkWeights || [];
              const dWeight = weights.find((w: any) => w.name.toLowerCase().includes("desir"))?.weight ?? 33.3;
              const vWeight = weights.find((w: any) => w.name.toLowerCase().includes("viab"))?.weight ?? 33.3;
              const fWeight = weights.find((w: any) => w.name.toLowerCase().includes("feas"))?.weight ?? 33.3;

              return (
                <div
                  key={project.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-300 hover:shadow-md transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        /{project.slug}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 leading-snug">
                      {project.name}
                    </h3>

                    {project.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>
                    )}

                    {/* Framework Weight Distribution */}
                    <div className="pt-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Framework Weights:
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                        <div className="p-1.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-900 font-semibold">
                          D: {dWeight}%
                        </div>
                        <div className="p-1.5 rounded bg-blue-50 border border-blue-100 text-blue-900 font-semibold">
                          V: {vWeight}%
                        </div>
                        <div className="p-1.5 rounded bg-amber-50 border border-amber-100 text-amber-900 font-semibold">
                          F: {fWeight}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      {project._count?.findings ?? 0} Findings • {project._count?.groups ?? 0} Groups
                    </span>

                    <Link
                      href={`/${project.slug}`}
                      className="inline-flex items-center gap-1 font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      <span>Open Viewer</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>Enzi Workshop Platform • Desirability, Viability & Feasibility (DVF) Engine</p>
          <div className="flex items-center gap-4">
            <Link href="/admin" className="hover:text-slate-800 transition">
              Admin Portal
            </Link>
            <Link href="/admin/login" className="hover:text-slate-800 transition">
              Facilitator Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
