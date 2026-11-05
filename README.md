# Enzi Workshop Platform (DVF Prioritization Engine)

A specialized workshop facilitation tool designed to capture user findings, map complex data structures, and prioritize features using a customizable **Desirability, Viability, and Feasibility (DVF)** framework.

Built strictly according to the [Enzi Workshop Platform PRD](/Users/naimy/Downloads/enzi_workshop_platform_prd.md).

---

## 🚀 Key Highlights & Architecture

The platform features two streamlined primary interfaces:

1. **Landing Page (Result Viewer):** Workshop/public-facing UI mapped directly to project URL slugs (e.g. `/[project-slug]`).
   - **Findings Directory:** Filterable list of all active findings with composite DVF badges.
   - **3-Tab Detail View:**
     - **Tab 1: Desirability:** Deep transparency into category rule evaluations and arithmetic formula breakdowns.
     - **Tab 2: Viability:** Participant validation matrix intersecting Participants (grouped by Group) with defined Aspects. Real-time voting matrix with live score re-calculation.
     - **Tab 3: Feasibility (2x2 Matrix):** Interactive 2x2 quadrant canvas (**Big Bets**, **Quick Wins**, **Avoid**, **Fill-ins**) with draggable Post-it notes featuring **optimistic UI updates** and instant database persistence.
   - **Whole-Project 2x2 Feasibility Board:** Visualizes all findings across the portfolio on a shared canvas.

2. **Admin Dashboard (`/admin`):**
   - **Project Management:** Create projects with auto-generated URL slugs, active/inactive toggles.
   - **Framework & Weighting Engine:** Real-time **Auto-Calibration Logic** that proportionally normalizes weights when inputs exceed or differ from 100%.
   - **Findings & Dynamic Tagging:** Create findings with customizable tags (*Sumber*, *Platform*, *Feature*).
   - **Hierarchical Parameters (L1 → L2 → L3):** Level 1 Categories with custom logic-based scoring rules (e.g. >66% = 3, >33% = 2, <=33% = 1), Level 2 Sub-categories, and Level 3 Segments.
   - **Group & Participant Manager:** Manage groups and participants for validation matrices.
   - **User Management (Admin only):** Create and manage facilitator/admin credentials.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 App Router (React, TypeScript)
- **Styling:** Tailwind CSS, Lucide Icons, Custom Post-it physics & CSS
- **Database & ORM:** Prisma ORM (SQLite for local zero-config dev, PostgreSQL / Supabase ready for cloud)
- **Authentication:** Secure HTTP-only JWT sessions & bcrypt password hashing
- **CI/CD:** GitHub Actions automated build, lint, and verification workflow

---

## 🏃 Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database & Seed Workshop Data
```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 3. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
- Public Result Viewer: [http://localhost:3000/b2b-cash-management](http://localhost:3000/b2b-cash-management)
- Admin Dashboard: [http://localhost:3000/admin](http://localhost:3000/admin)

### Demo Credentials
- **Lead Admin:** `admin@enzi.io` / `admin123`
- **Facilitator:** `facilitator@enzi.io` / `facilitator123`
*(Or click the 1-click demo login buttons on the login page)*

---

## 🌐 Deploying to Vercel

1. Push code to your GitHub repository:
   ```bash
   git push origin main
   ```
2. In the [Vercel Dashboard](https://vercel.com):
   - Import repository `rubeushagrid66/enzi-ws`.
   - Provide your production database URL (e.g., free tier Supabase or Neon PostgreSQL, or Turso libSQL) in `DATABASE_URL`.
   - Set `JWT_SECRET` to a random secret string.
3. Deploy! Every future push to `main` will automatically trigger a new deployment.
