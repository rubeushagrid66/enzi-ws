import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with Enzi Workshop data...");

  // 1. Create Default Users
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const facilitatorPasswordHash = await bcrypt.hash("facilitator123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@enzi.io" },
    update: {},
    create: {
      name: "Enzi Lead Admin",
      email: "admin@enzi.io",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "facilitator@enzi.io" },
    update: {},
    create: {
      name: "Bambang Workshop Facilitator",
      email: "facilitator@enzi.io",
      passwordHash: facilitatorPasswordHash,
      role: "FACILITATOR",
    },
  });

  console.log("Users created:", admin.email);

  // 2. Create Project
  const projectSlug = "b2b-cash-management";
  let project = await prisma.project.findUnique({
    where: { slug: projectSlug },
  });

  if (project) {
    await prisma.project.delete({ where: { id: project.id } });
  }

  project = await prisma.project.create({
    data: {
      name: "B2B Cash Management Platform",
      slug: projectSlug,
      description:
        "Workshop prioritization for corporate banking, bulk payroll, and cash management modernization.",
      isActive: true,
      frameworkWeights: {
        create: [
          { name: "Desirability", weight: 40.0 },
          { name: "Viability", weight: 30.0 },
          { name: "Feasibility", weight: 30.0 },
        ],
      },
      viabilityAspects: {
        create: [
          {
            name: "Market Demand",
            description: "High willingness from corporate treasurers to adopt",
          },
          {
            name: "Revenue Stickiness",
            description: "Direct fee generation or high deposit retention impact",
          },
          {
            name: "Operational Scalability",
            description: "Can be supported smoothly by existing operations team",
          },
          {
            name: "Compliance & Security",
            description: "Aligns with enterprise security and regulatory mandates",
          },
        ],
      },
    },
  });

  console.log("Project created:", project.name, `(/${project.slug})`);

  // 3. Create Groups & Participants
  const groupStrategy = await prisma.group.create({
    data: {
      projectId: project.id,
      name: "Core Product & Strategy",
      participants: {
        create: [
          { name: "Budi Hartono", roleTitle: "Head of Product" },
          { name: "Siti Rahma", roleTitle: "Lead PM Cash Management" },
          { name: "Andi Pratama", roleTitle: "UX Research Lead" },
        ],
      },
    },
    include: { participants: true },
  });

  const groupCommercial = await prisma.group.create({
    data: {
      projectId: project.id,
      name: "Commercial & Business",
      participants: {
        create: [
          { name: "Dewi Lestari", roleTitle: "VP Corporate Banking" },
          { name: "Reza Fauzi", roleTitle: "Commercial Sales Director" },
        ],
      },
    },
    include: { participants: true },
  });

  const groupTech = await prisma.group.create({
    data: {
      projectId: project.id,
      name: "Engineering & Architecture",
      participants: {
        create: [
          { name: "Fajar Nugraha", roleTitle: "Principal Architect" },
          { name: "Maya Putri", roleTitle: "InfoSec & Compliance Lead" },
        ],
      },
    },
    include: { participants: true },
  });

  const allParticipants = [
    ...groupStrategy.participants,
    ...groupCommercial.participants,
    ...groupTech.participants,
  ];

  const aspects = await prisma.viabilityAspect.findMany({
    where: { projectId: project.id },
  });

  // 4. Create Parameters L1 -> L2 -> L3
  const paramL1Sumber = await prisma.parameterL1.create({
    data: {
      projectId: project.id,
      name: "Sumber Riset",
      scoringRules: JSON.stringify([
        { minPercent: 66, score: 3, label: "High Multi-Source Consensus (>66%)" },
        { minPercent: 33, score: 2, label: "Moderate Consensus (>33%)" },
        { minPercent: 0, score: 1, label: "Emerging Single Signal (<=33%)" },
      ]),
      subCategories: {
        create: [
          {
            name: "Wawancara",
            segments: {
              create: [
                { name: "Corporate Treasury" },
                { name: "SME Merchant" },
              ],
            },
          },
          {
            name: "Survey Riset",
            segments: {
              create: [
                { name: "Finance Controllers" },
                { name: "Branch Operations" },
              ],
            },
          },
          {
            name: "FGD Internal",
            segments: {
              create: [
                { name: "Relationship Managers" },
              ],
            },
          },
        ],
      },
    },
    include: {
      subCategories: {
        include: { segments: true },
      },
    },
  });

  const paramL1Platform = await prisma.parameterL1.create({
    data: {
      projectId: project.id,
      name: "Platform",
      scoringRules: JSON.stringify([
        { minPercent: 50, score: 3, label: "Multi-Platform Coverage (>=50%)" },
        { minPercent: 0, score: 1, label: "Single Platform (<50%)" },
      ]),
      subCategories: {
        create: [
          {
            name: "CMS Portal",
            segments: {
              create: [
                { name: "Web Desktop" },
                { name: "Host-to-Host API" },
              ],
            },
          },
          {
            name: "DVC Mobile",
            segments: {
              create: [
                { name: "Executive Approver App" },
              ],
            },
          },
        ],
      },
    },
    include: {
      subCategories: {
        include: { segments: true },
      },
    },
  });

  const allL3Segments = [
    ...paramL1Sumber.subCategories.flatMap((sc) => sc.segments),
    ...paramL1Platform.subCategories.flatMap((sc) => sc.segments),
  ];

  // 5. Create Findings with DVF values and initial Feasibility Quadrants
  const findingsData = [
    {
      title: "Tampilan Dashboard Membingungkan & Navigasi Terlalu Padat",
      description:
        "Nasabah korporat kesulitan menemukan menu transfer berkala dan ringkasan mutasi rekening utama dalam satu layar.",
      tags: JSON.stringify([
        { category: "Sumber", value: "Wawancara" },
        { category: "Platform", value: "CMS Portal" },
        { category: "Feature", value: "Dashboard" },
      ]),
      feasibilityX: 78.0, // Low Effort (Easier)
      feasibilityY: 82.0, // High Impact
      feasibilityQuadrant: "QUICK_WINS",
      feasibilityImpact: "HIGH",
      feasibilityEffort: "LOW",
    },
    {
      title: "Multi-Tier Approval Workflow dengan Notifikasi Push Mobile",
      description:
        "CFO & Direktur Keuangan ingin menyetujui transaksi bernilai besar (>5 Miliar) langsung dari smartphone tanpa perlu membuka laptop dengan token fisik.",
      tags: JSON.stringify([
        { category: "Sumber", value: "Wawancara" },
        { category: "Sumber", value: "FGD Internal" },
        { category: "Platform", value: "DVC Mobile" },
        { category: "Feature", value: "Approval Workflow" },
      ]),
      feasibilityX: 28.0, // High Effort
      feasibilityY: 92.0, // High Impact
      feasibilityQuadrant: "BIG_BETS",
      feasibilityImpact: "HIGH",
      feasibilityEffort: "HIGH",
    },
    {
      title: "Integrasi Real-time ERP via Webhook & Open API",
      description:
        "Otomasi rekonsiliasi pembayaran tagihan batch langsung masuk ke sistem SAP/Oracle nasabah korporat.",
      tags: JSON.stringify([
        { category: "Sumber", value: "Survey Riset" },
        { category: "Sumber", value: "FGD Internal" },
        { category: "Platform", value: "CMS Portal" },
        { category: "Feature", value: "API Host-to-Host" },
      ]),
      feasibilityX: 20.0, // High Effort
      feasibilityY: 86.0, // High Impact
      feasibilityQuadrant: "BIG_BETS",
      feasibilityImpact: "HIGH",
      feasibilityEffort: "HIGH",
    },
    {
      title: "Fitur Pengingat Otomatis Jadwal Payroll & Tagihan Vendor",
      description:
        "Notifikasi terjadwal via email dan dashboard 3 hari sebelum jatuh tempo pembayaran massal.",
      tags: JSON.stringify([
        { category: "Sumber", value: "Wawancara" },
        { category: "Sumber", value: "Survey Riset" },
        { category: "Platform", value: "CMS Portal" },
        { category: "Feature", value: "Smart Reminder" },
      ]),
      feasibilityX: 84.0, // Low Effort
      feasibilityY: 74.0, // High Impact
      feasibilityQuadrant: "QUICK_WINS",
      feasibilityImpact: "HIGH",
      feasibilityEffort: "LOW",
    },
    {
      title: "Kustomisasi Warna Tema Portal Sesuai Brand Perusahaan",
      description:
        "Fitur mengubah skema warna CSS dan logo portal per user group korporasi.",
      tags: JSON.stringify([
        { category: "Sumber", value: "Survey Riset" },
        { category: "Platform", value: "CMS Portal" },
        { category: "Feature", value: "White-label" },
      ]),
      feasibilityX: 18.0, // High Effort
      feasibilityY: 28.0, // Low Impact
      feasibilityQuadrant: "AVOID",
      feasibilityImpact: "LOW",
      feasibilityEffort: "HIGH",
    },
    {
      title: "Ekspor Laporan Transaksi ke Format CSV/Excel Ringkas",
      description:
        "Download mutasi harian dalam satu klik dengan kolom yang dapat disesuaikan kebutuhan akunting.",
      tags: JSON.stringify([
        { category: "Sumber", value: "Wawancara" },
        { category: "Platform", value: "CMS Portal" },
        { category: "Feature", value: "Export CSV" },
      ]),
      feasibilityX: 88.0, // Low Effort
      feasibilityY: 42.0, // Low Impact
      feasibilityQuadrant: "FILL_INS",
      feasibilityImpact: "LOW",
      feasibilityEffort: "LOW",
    },
  ];

  for (const item of findingsData) {
    const finding = await prisma.finding.create({
      data: {
        projectId: project.id,
        title: item.title,
        description: item.description,
        tags: item.tags,
        feasibilityX: item.feasibilityX,
        feasibilityY: item.feasibilityY,
        feasibilityQuadrant: item.feasibilityQuadrant,
        feasibilityImpact: item.feasibilityImpact,
        feasibilityEffort: item.feasibilityEffort,
      },
    });

    // Map finding to parameter values
    if (allL3Segments.length > 0) {
      await prisma.findingParameterValue.create({
        data: {
          findingId: finding.id,
          l3Id: allL3Segments[0].id,
          value: item.title,
        },
      });

      if (allL3Segments.length > 1 && item.feasibilityQuadrant === "BIG_BETS") {
        await prisma.findingParameterValue.create({
          data: {
            findingId: finding.id,
            l3Id: allL3Segments[1].id,
            value: item.title,
          },
        });
      }
    }

    // Seed Viability votes
    for (let i = 0; i < allParticipants.length; i++) {
      const p = allParticipants[i];
      for (let j = 0; j < aspects.length; j++) {
        const aspect = aspects[j];
        // High priority findings get more votes
        const shouldValidate =
          item.feasibilityImpact === "HIGH" ? (i + j) % 3 !== 0 : (i + j) % 2 === 0;

        await prisma.viabilityVote.create({
          data: {
            findingId: finding.id,
            participantId: p.id,
            aspectId: aspect.id,
            isValidated: shouldValidate,
          },
        });
      }
    }
  }

  console.log("Seeded findings, parameter values, and viability voting matrix successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
