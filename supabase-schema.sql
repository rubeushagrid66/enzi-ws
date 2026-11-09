-- ============================================================
-- ENZI WORKSHOP PLATFORM - SUPABASE SCHEMA & INITIAL SEED
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'FACILITATOR',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS framework_weights (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 33.33,
  custom_formula TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_title TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS viability_aspects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parameters_l1 (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scoring_rules JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parameters_l2 (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  l1_id TEXT NOT NULL REFERENCES parameters_l1(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parameters_l3 (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  l2_id TEXT NOT NULL REFERENCES parameters_l2(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  feasibility_x NUMERIC DEFAULT 50.0,
  feasibility_y NUMERIC DEFAULT 50.0,
  feasibility_quadrant TEXT DEFAULT 'QUICK_WINS',
  feasibility_impact TEXT DEFAULT 'HIGH',
  feasibility_effort TEXT DEFAULT 'LOW',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finding_parameter_values (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  l3_id TEXT NOT NULL REFERENCES parameters_l3(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(finding_id, l3_id, value)
);

CREATE TABLE IF NOT EXISTS viability_votes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  aspect_id TEXT NOT NULL REFERENCES viability_aspects(id) ON DELETE CASCADE,
  is_validated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(finding_id, participant_id, aspect_id)
);

-- 2. Disable Row Level Security (RLS) for simple API access
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE framework_weights DISABLE ROW LEVEL SECURITY;
ALTER TABLE groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE viability_aspects DISABLE ROW LEVEL SECURITY;
ALTER TABLE parameters_l1 DISABLE ROW LEVEL SECURITY;
ALTER TABLE parameters_l2 DISABLE ROW LEVEL SECURITY;
ALTER TABLE parameters_l3 DISABLE ROW LEVEL SECURITY;
ALTER TABLE findings DISABLE ROW LEVEL SECURITY;
ALTER TABLE finding_parameter_values DISABLE ROW LEVEL SECURITY;
ALTER TABLE viability_votes DISABLE ROW LEVEL SECURITY;

-- Ideas: global (like the findings pool). An idea is linked to 1 or
-- many findings via idea_findings; a finding shows its linked ideas
-- on its detail page.
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  sumber JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Sumber moved to Findings (the linked items) 2026-11-09: each finding
-- records which research source(s) it came from (Wawancara/Survey/
-- Internal). Added to existing tables with:
--   ALTER TABLE ideas ADD COLUMN IF NOT EXISTS sumber JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS idea_findings (
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (idea_id, finding_id)
);

ALTER TABLE ideas DISABLE ROW LEVEL SECURITY;
ALTER TABLE idea_findings DISABLE ROW LEVEL SECURITY;

-- 3. Seed Initial Demo Users (admin123 and facilitator123)
INSERT INTO users (name, email, password_hash, role)
VALUES 
  ('Enzi Lead Admin', 'admin@enzi.io', '$2a$10$6qunsWXdTmBZudw39PHtE.x68Aqsr8caFU2jWGpwS.TggWhAfqU52', 'ADMIN'),
  ('Workshop Facilitator', 'facilitator@enzi.io', '$2a$10$Jtxy/dp7asEw5AAC45GstOY/0KW4O0x0AA7N6wtKriVmFVxtedeaa', 'FACILITATOR')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 4. Seed Initial Project
INSERT INTO projects (id, name, slug, description, is_active)
VALUES (
  'proj_cash_mgmt_001',
  'B2B Cash Management Platform',
  'b2b-cash-management',
  'Workshop prioritization for corporate banking, bulk payroll, and cash management modernization.',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 5. Seed Framework Weights
INSERT INTO framework_weights (project_id, name, weight)
VALUES 
  ('proj_cash_mgmt_001', 'Desirability', 40.0),
  ('proj_cash_mgmt_001', 'Viability', 30.0),
  ('proj_cash_mgmt_001', 'Feasibility', 30.0)
ON CONFLICT (project_id, name) DO NOTHING;

-- 6. Seed Aspects
INSERT INTO viability_aspects (id, project_id, name, description)
VALUES 
  ('asp_1', 'proj_cash_mgmt_001', 'Market Demand', 'High willingness from corporate clients to adopt'),
  ('asp_2', 'proj_cash_mgmt_001', 'Revenue Stickiness', 'Direct fee generation or deposit retention impact'),
  ('asp_3', 'proj_cash_mgmt_001', 'Operational Scalability', 'Can be supported smoothly by operations team'),
  ('asp_4', 'proj_cash_mgmt_001', 'Compliance & Security', 'Aligns with enterprise security and regulatory mandates')
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Groups & Participants
INSERT INTO groups (id, project_id, name)
VALUES 
  ('grp_1', 'proj_cash_mgmt_001', 'Core Product & Strategy'),
  ('grp_2', 'proj_cash_mgmt_001', 'Commercial & Business'),
  ('grp_3', 'proj_cash_mgmt_001', 'Engineering & Architecture')
ON CONFLICT (id) DO NOTHING;

INSERT INTO participants (id, group_id, name, role_title)
VALUES 
  ('part_1', 'grp_1', 'Budi Hartono', 'Head of Product'),
  ('part_2', 'grp_1', 'Siti Rahma', 'Lead PM Cash Management'),
  ('part_3', 'grp_1', 'Andi Pratama', 'UX Research Lead'),
  ('part_4', 'grp_2', 'Dewi Lestari', 'VP Corporate Banking'),
  ('part_5', 'grp_2', 'Reza Fauzi', 'Commercial Sales Director'),
  ('part_6', 'grp_3', 'Fajar Nugraha', 'Principal Architect'),
  ('part_7', 'grp_3', 'Maya Putri', 'InfoSec & Compliance Lead')
ON CONFLICT (id) DO NOTHING;

-- 8. Seed Parameters
INSERT INTO parameters_l1 (id, project_id, name, scoring_rules)
VALUES 
  ('l1_sumber', 'proj_cash_mgmt_001', 'Sumber Riset', '[{"minPercent": 66, "score": 3}, {"minPercent": 33, "score": 2}, {"minPercent": 0, "score": 1}]'::jsonb),
  ('l1_platform', 'proj_cash_mgmt_001', 'Platform', '[{"minPercent": 50, "score": 3}, {"minPercent": 0, "score": 1}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO parameters_l2 (id, l1_id, name)
VALUES 
  ('l2_wawancara', 'l1_sumber', 'Wawancara'),
  ('l2_survey', 'l1_sumber', 'Survey Riset'),
  ('l2_fgd', 'l1_sumber', 'FGD Internal'),
  ('l2_cms', 'l1_platform', 'CMS Portal'),
  ('l2_dvc', 'l1_platform', 'DVC Mobile')
ON CONFLICT (id) DO NOTHING;

INSERT INTO parameters_l3 (id, l2_id, name)
VALUES 
  ('l3_treasury', 'l2_wawancara', 'Corporate Treasury'),
  ('l3_controllers', 'l2_survey', 'Finance Controllers'),
  ('l3_desktop', 'l2_cms', 'Web Desktop')
ON CONFLICT (id) DO NOTHING;

-- 9. Seed Findings
INSERT INTO findings (id, project_id, title, description, tags, feasibility_x, feasibility_y, feasibility_quadrant, feasibility_impact, feasibility_effort)
VALUES 
  ('find_1', 'proj_cash_mgmt_001', 'Tampilan Dashboard Membingungkan & Navigasi Terlalu Padat', 'Nasabah korporat kesulitan menemukan menu transfer berkala dan ringkasan mutasi rekening utama dalam satu layar.', '[{"category": "Sumber", "value": "Wawancara"}, {"category": "Platform", "value": "CMS Portal"}, {"category": "Feature", "value": "Dashboard"}]'::jsonb, 78.0, 82.0, 'QUICK_WINS', 'HIGH', 'LOW'),
  ('find_2', 'proj_cash_mgmt_001', 'Multi-Tier Approval Workflow dengan Notifikasi Push Mobile', 'CFO & Direktur Keuangan ingin menyetujui transaksi bernilai besar (>5 Miliar) langsung dari smartphone tanpa perlu membuka laptop dengan token fisik.', '[{"category": "Sumber", "value": "Wawancara"}, {"category": "Sumber", "value": "FGD Internal"}, {"category": "Platform", "value": "DVC Mobile"}, {"category": "Feature", "value": "Approval Workflow"}]'::jsonb, 28.0, 92.0, 'BIG_BETS', 'HIGH', 'HIGH'),
  ('find_3', 'proj_cash_mgmt_001', 'Integrasi Real-time ERP via Webhook & Open API', 'Otomasi rekonsiliasi pembayaran tagihan batch langsung masuk ke sistem SAP/Oracle nasabah korporat.', '[{"category": "Sumber", "value": "Survey Riset"}, {"category": "Sumber", "value": "FGD Internal"}, {"category": "Platform", "value": "CMS Portal"}, {"category": "Feature", "value": "Host-to-Host API"}]'::jsonb, 20.0, 86.0, 'BIG_BETS', 'HIGH', 'HIGH'),
  ('find_4', 'proj_cash_mgmt_001', 'Fitur Pengingat Otomatis Jadwal Payroll & Tagihan Vendor', 'Notifikasi terjadwal via email dan dashboard 3 hari sebelum jatuh tempo pembayaran massal.', '[{"category": "Sumber", "value": "Wawancara"}, {"category": "Sumber", "value": "Survey Riset"}, {"category": "Platform", "value": "CMS Portal"}, {"category": "Feature", "value": "Smart Reminder"}]'::jsonb, 84.0, 74.0, 'QUICK_WINS', 'HIGH', 'LOW'),
  ('find_5', 'proj_cash_mgmt_001', 'Kustomisasi Warna Tema Portal Sesuai Brand Perusahaan', 'Fitur mengubah skema warna CSS dan logo portal per user group korporasi.', '[{"category": "Sumber", "value": "Survey Riset"}, {"category": "Platform", "value": "CMS Portal"}, {"category": "Feature", "value": "White-label"}]'::jsonb, 18.0, 28.0, 'AVOID', 'LOW', 'HIGH'),
  ('find_6', 'proj_cash_mgmt_001', 'Ekspor Laporan Transaksi ke Format CSV/Excel Ringkas', 'Download mutasi harian dalam satu klik dengan kolom yang dapat disesuaikan kebutuhan akunting.', '[{"category": "Sumber", "value": "Wawancara"}, {"category": "Platform", "value": "CMS Portal"}, {"category": "Feature", "value": "Export CSV"}]'::jsonb, 88.0, 42.0, 'FILL_INS', 'LOW', 'LOW')
ON CONFLICT (id) DO NOTHING;

-- 10. Seed Viability Votes
INSERT INTO viability_votes (finding_id, participant_id, aspect_id, is_validated)
VALUES 
  ('find_1', 'part_1', 'asp_1', true),
  ('find_1', 'part_2', 'asp_1', true),
  ('find_1', 'part_3', 'asp_1', true),
  ('find_1', 'part_1', 'asp_2', true),
  ('find_1', 'part_2', 'asp_3', true),
  ('find_2', 'part_1', 'asp_1', true),
  ('find_2', 'part_4', 'asp_1', true),
  ('find_2', 'part_5', 'asp_2', true),
  ('find_2', 'part_6', 'asp_3', true),
  ('find_2', 'part_7', 'asp_4', true)
ON CONFLICT DO NOTHING;
