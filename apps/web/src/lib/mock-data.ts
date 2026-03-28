// ─── Types ────────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  batch: string;
  industry: string;
  status: "Active" | "Acquired" | "Inactive";
  location: string;
  lat: number;
  lng: number;
  employees: number;
  description: string;
  founded: number;
  founders: string[];
  tags: string[];
  hiring: boolean;
  url: string;
}

export interface Founder {
  id: string;
  name: string;
  companyId: string;
  role: string;
  linkedin: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "company" | "founder" | "industry" | "batch" | "location";
  color: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface EntityCount {
  type: string;
  count: number;
  color: string;
  icon: string;
}

// ─── Mock Companies ──────────────────────────────────────────────────────────

export const companies: Company[] = [
  {
    id: "c1", name: "Acme AI", batch: "W24", industry: "AI/ML",
    status: "Active", location: "San Francisco, CA", lat: 37.7749, lng: -122.4194,
    employees: 12, description: "Enterprise AI automation platform for document processing and workflow optimization.",
    founded: 2023, founders: ["Alice Chen", "Bob Martinez"], tags: ["B2B", "SaaS", "AI"], hiring: true,
    url: "https://acmeai.example.com",
  },
  {
    id: "c2", name: "HealthBridge", batch: "S23", industry: "Healthcare",
    status: "Active", location: "New York, NY", lat: 40.7128, lng: -74.006,
    employees: 28, description: "Telemedicine platform connecting rural patients with specialists using AI triage.",
    founded: 2022, founders: ["Dr. Sarah Kim"], tags: ["Healthcare", "Telehealth", "AI"], hiring: true,
    url: "https://healthbridge.example.com",
  },
  {
    id: "c3", name: "GreenStack", batch: "W24", industry: "Climate",
    status: "Active", location: "London, UK", lat: 51.5074, lng: -0.1278,
    employees: 8, description: "Carbon accounting API for fintech companies and banks.",
    founded: 2023, founders: ["James Wright", "Priya Patel"], tags: ["Climate", "Fintech", "API"], hiring: false,
    url: "https://greenstack.example.com",
  },
  {
    id: "c4", name: "DevForge", batch: "S23", industry: "Developer Tools",
    status: "Active", location: "San Francisco, CA", lat: 37.78, lng: -122.41,
    employees: 15, description: "AI-powered code review and testing automation for engineering teams.",
    founded: 2022, founders: ["Mike Torres"], tags: ["DevTools", "AI", "SaaS"], hiring: true,
    url: "https://devforge.example.com",
  },
  {
    id: "c5", name: "NomadPay", batch: "W23", industry: "Fintech",
    status: "Active", location: "Singapore", lat: 1.3521, lng: 103.8198,
    employees: 42, description: "Cross-border payments for remote workers and digital nomads.",
    founded: 2022, founders: ["Wei Lin", "Raj Kumar"], tags: ["Fintech", "Payments", "Global"], hiring: true,
    url: "https://nomadpay.example.com",
  },
  {
    id: "c6", name: "EduVerse", batch: "W24", industry: "Education",
    status: "Active", location: "Berlin, Germany", lat: 52.52, lng: 13.405,
    employees: 10, description: "Immersive VR learning experiences for K-12 STEM education.",
    founded: 2023, founders: ["Anna Müller"], tags: ["EdTech", "VR", "STEM"], hiring: false,
    url: "https://eduverse.example.com",
  },
  {
    id: "c7", name: "LogiTrack", batch: "S22", industry: "Logistics",
    status: "Acquired", location: "Chicago, IL", lat: 41.8781, lng: -87.6298,
    employees: 55, description: "Real-time fleet tracking and route optimization for last-mile delivery.",
    founded: 2021, founders: ["Carlos Rivera", "Janet Obi"], tags: ["Logistics", "IoT", "AI"], hiring: false,
    url: "https://logitrack.example.com",
  },
  {
    id: "c8", name: "SecureID", batch: "W23", industry: "Security",
    status: "Active", location: "Tel Aviv, Israel", lat: 32.0853, lng: 34.7818,
    employees: 22, description: "Biometric identity verification for financial institutions.",
    founded: 2022, founders: ["Avi Goldstein", "Noa Levy"], tags: ["Security", "Identity", "Fintech"], hiring: true,
    url: "https://secureid.example.com",
  },
  {
    id: "c9", name: "FarmSense", batch: "S23", industry: "AgriTech",
    status: "Active", location: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219,
    employees: 18, description: "IoT sensors and AI analytics for smallholder farms in Africa.",
    founded: 2022, founders: ["Grace Wanjiku"], tags: ["AgriTech", "IoT", "Africa"], hiring: true,
    url: "https://farmsense.example.com",
  },
  {
    id: "c10", name: "CryptoLedger", batch: "W22", industry: "Crypto",
    status: "Inactive", location: "Miami, FL", lat: 25.7617, lng: -80.1918,
    employees: 5, description: "Decentralized accounting protocol for DAOs.",
    founded: 2021, founders: ["Tyler Nash"], tags: ["Crypto", "Web3", "DeFi"], hiring: false,
    url: "https://cryptoledger.example.com",
  },
  {
    id: "c11", name: "RoboChef", batch: "W24", industry: "Robotics",
    status: "Active", location: "Tokyo, Japan", lat: 35.6762, lng: 139.6503,
    employees: 20, description: "Autonomous kitchen robots for cloud kitchens and restaurants.",
    founded: 2023, founders: ["Yuki Tanaka", "Kenji Sato"], tags: ["Robotics", "Food", "AI"], hiring: true,
    url: "https://robochef.example.com",
  },
  {
    id: "c12", name: "TalentRadar", batch: "S23", industry: "HR Tech",
    status: "Active", location: "Austin, TX", lat: 30.2672, lng: -97.7431,
    employees: 14, description: "AI-driven talent sourcing and matching for tech companies.",
    founded: 2022, founders: ["Lisa Park"], tags: ["HR", "AI", "SaaS"], hiring: false,
    url: "https://talentradar.example.com",
  },
  {
    id: "c13", name: "SolarGrid", batch: "W23", industry: "Climate",
    status: "Active", location: "Mumbai, India", lat: 19.076, lng: 72.8777,
    employees: 35, description: "Community solar microgrids for underserved areas.",
    founded: 2022, founders: ["Arjun Mehta", "Deepa Rao"], tags: ["Climate", "Energy", "Impact"], hiring: true,
    url: "https://solargrid.example.com",
  },
  {
    id: "c14", name: "Pixelfy", batch: "S22", industry: "AI/ML",
    status: "Active", location: "Los Angeles, CA", lat: 34.0522, lng: -118.2437,
    employees: 25, description: "Generative AI for e-commerce product photography.",
    founded: 2021, founders: ["Jordan Lee"], tags: ["AI", "E-commerce", "Creative"], hiring: true,
    url: "https://pixelfy.example.com",
  },
  {
    id: "c15", name: "MediVault", batch: "W24", industry: "Healthcare",
    status: "Active", location: "Boston, MA", lat: 42.3601, lng: -71.0589,
    employees: 11, description: "Decentralized health records with patient-controlled data sharing.",
    founded: 2023, founders: ["Dr. Amy Zhou", "Mark Stevens"], tags: ["Healthcare", "Privacy", "Blockchain"], hiring: false,
    url: "https://medivault.example.com",
  },
  {
    id: "c16", name: "BuildRight", batch: "S23", industry: "Construction",
    status: "Active", location: "Dubai, UAE", lat: 25.2048, lng: 55.2708,
    employees: 30, description: "AI project management for construction and real estate development.",
    founded: 2022, founders: ["Omar Hassan"], tags: ["Construction", "AI", "PropTech"], hiring: true,
    url: "https://buildright.example.com",
  },
  {
    id: "c17", name: "LangCore", batch: "W24", industry: "AI/ML",
    status: "Active", location: "San Francisco, CA", lat: 37.77, lng: -122.43,
    employees: 9, description: "Open-source LLM evaluation and fine-tuning infrastructure.",
    founded: 2023, founders: ["Ethan Ross", "Zara Ahmed"], tags: ["AI", "Open Source", "Infrastructure"], hiring: true,
    url: "https://langcore.example.com",
  },
  {
    id: "c18", name: "PetLoop", batch: "S22", industry: "Consumer",
    status: "Acquired", location: "Portland, OR", lat: 45.5155, lng: -122.6789,
    employees: 40, description: "Subscription pet wellness platform with vet telehealth.",
    founded: 2021, founders: ["Megan Wu"], tags: ["Consumer", "Pets", "Subscription"], hiring: false,
    url: "https://petloop.example.com",
  },
  {
    id: "c19", name: "DataMesh", batch: "W23", industry: "Developer Tools",
    status: "Active", location: "Toronto, Canada", lat: 43.6532, lng: -79.3832,
    employees: 16, description: "Data mesh platform for distributed data teams.",
    founded: 2022, founders: ["Alex Nguyen", "Sam Okafor"], tags: ["DevTools", "Data", "Enterprise"], hiring: true,
    url: "https://datamesh.example.com",
  },
  {
    id: "c20", name: "UrbanFlow", batch: "W24", industry: "Smart Cities",
    status: "Active", location: "Seoul, South Korea", lat: 37.5665, lng: 126.978,
    employees: 13, description: "Traffic flow optimization using computer vision and IoT sensors.",
    founded: 2023, founders: ["Min-Jun Park"], tags: ["Smart Cities", "CV", "IoT"], hiring: true,
    url: "https://urbanflow.example.com",
  },
];

// ─── Mock Founders ───────────────────────────────────────────────────────────

export const founders: Founder[] = [
  { id: "f1", name: "Alice Chen", companyId: "c1", role: "CEO", linkedin: "#" },
  { id: "f2", name: "Bob Martinez", companyId: "c1", role: "CTO", linkedin: "#" },
  { id: "f3", name: "Dr. Sarah Kim", companyId: "c2", role: "CEO", linkedin: "#" },
  { id: "f4", name: "James Wright", companyId: "c3", role: "CEO", linkedin: "#" },
  { id: "f5", name: "Priya Patel", companyId: "c3", role: "CTO", linkedin: "#" },
  { id: "f6", name: "Mike Torres", companyId: "c4", role: "CEO", linkedin: "#" },
  { id: "f7", name: "Wei Lin", companyId: "c5", role: "CEO", linkedin: "#" },
  { id: "f8", name: "Raj Kumar", companyId: "c5", role: "CTO", linkedin: "#" },
  { id: "f9", name: "Anna Müller", companyId: "c6", role: "CEO", linkedin: "#" },
  { id: "f10", name: "Carlos Rivera", companyId: "c7", role: "CEO", linkedin: "#" },
  { id: "f11", name: "Yuki Tanaka", companyId: "c11", role: "CEO", linkedin: "#" },
  { id: "f12", name: "Ethan Ross", companyId: "c17", role: "CEO", linkedin: "#" },
  { id: "f13", name: "Zara Ahmed", companyId: "c17", role: "CTO", linkedin: "#" },
];

// ─── Industries ──────────────────────────────────────────────────────────────

export const industries = [
  "AI/ML", "Healthcare", "Climate", "Developer Tools", "Fintech",
  "Education", "Logistics", "Security", "AgriTech", "Crypto",
  "Robotics", "HR Tech", "Construction", "Consumer", "Smart Cities",
];

export const batches = ["W24", "S23", "W23", "S22", "W22"];

// ─── Graph Data ──────────────────────────────────────────────────────────────

const nodeColors: Record<string, string> = {
  company: "#147EB3",   // cerulean
  founder: "#9D3F9D",   // violet
  industry: "#D1980B",  // gold
  batch: "#00A396",     // turquoise
  location: "#D33D17",  // vermilion
};

export const graphNodes: GraphNode[] = [
  // Companies
  ...companies.slice(0, 12).map((c) => ({
    id: c.id, label: c.name, type: "company" as const, color: nodeColors.company,
  })),
  // Founders
  ...founders.slice(0, 8).map((f) => ({
    id: f.id, label: f.name, type: "founder" as const, color: nodeColors.founder,
  })),
  // Industries
  ...["AI/ML", "Healthcare", "Climate", "Fintech", "Developer Tools", "Robotics"].map((ind) => ({
    id: `ind-${ind.toLowerCase().replace(/[/ ]/g, "-")}`,
    label: ind,
    type: "industry" as const,
    color: nodeColors.industry,
  })),
  // Batches
  ...["W24", "S23", "W23"].map((b) => ({
    id: `batch-${b.toLowerCase()}`, label: b, type: "batch" as const, color: nodeColors.batch,
  })),
];

export const graphEdges: GraphEdge[] = [
  // Founded by
  { id: "e1", source: "c1", target: "f1", label: "FOUNDED_BY" },
  { id: "e2", source: "c1", target: "f2", label: "FOUNDED_BY" },
  { id: "e3", source: "c2", target: "f3", label: "FOUNDED_BY" },
  { id: "e4", source: "c3", target: "f4", label: "FOUNDED_BY" },
  { id: "e5", source: "c3", target: "f5", label: "FOUNDED_BY" },
  { id: "e6", source: "c4", target: "f6", label: "FOUNDED_BY" },
  { id: "e7", source: "c5", target: "f7", label: "FOUNDED_BY" },
  { id: "e8", source: "c5", target: "f8", label: "FOUNDED_BY" },
  // In industry
  { id: "e9", source: "c1", target: "ind-ai-ml", label: "IN_INDUSTRY" },
  { id: "e10", source: "c2", target: "ind-healthcare", label: "IN_INDUSTRY" },
  { id: "e11", source: "c3", target: "ind-climate", label: "IN_INDUSTRY" },
  { id: "e12", source: "c4", target: "ind-developer-tools", label: "IN_INDUSTRY" },
  { id: "e13", source: "c5", target: "ind-fintech", label: "IN_INDUSTRY" },
  { id: "e14", source: "c11", target: "ind-robotics", label: "IN_INDUSTRY" },
  { id: "e15", source: "c17", target: "ind-ai-ml", label: "IN_INDUSTRY" },
  // In batch
  { id: "e16", source: "c1", target: "batch-w24", label: "IN_BATCH" },
  { id: "e17", source: "c2", target: "batch-s23", label: "IN_BATCH" },
  { id: "e18", source: "c3", target: "batch-w24", label: "IN_BATCH" },
  { id: "e19", source: "c4", target: "batch-s23", label: "IN_BATCH" },
  { id: "e20", source: "c5", target: "batch-w23", label: "IN_BATCH" },
  { id: "e21", source: "c11", target: "batch-w24", label: "IN_BATCH" },
  { id: "e22", source: "c17", target: "batch-w24", label: "IN_BATCH" },
  // Similar
  { id: "e23", source: "c1", target: "c17", label: "SIMILAR_TO" },
  { id: "e24", source: "c1", target: "c4", label: "SIMILAR_TO" },
  { id: "e25", source: "c3", target: "c13", label: "SIMILAR_TO" },
];

// ─── Entity Counts ───────────────────────────────────────────────────────────

export const entityCounts: EntityCount[] = [
  { type: "Companies", count: 20, color: "#147EB3", icon: "Building2" },
  { type: "Founders", count: 13, color: "#9D3F9D", icon: "Users" },
  { type: "Industries", count: 15, color: "#D1980B", icon: "Tags" },
  { type: "Locations", count: 16, color: "#D33D17", icon: "MapPin" },
  { type: "Batches", count: 5, color: "#00A396", icon: "Calendar" },
  { type: "Job Postings", count: 34, color: "#2D72D2", icon: "Briefcase" },
];

// ─── Source Types ────────────────────────────────────────────────────────────

export interface Source {
  id: string;
  name: string;
  type: "Dataset" | "API" | "Web Scrape" | "Document" | "Manual Entry";
  status: "Verified" | "Ingested" | "Pending" | "Failed" | "Stale";
  confidence: "High" | "Medium" | "Low" | "None";
  records: number;
  lastUpdated: string;
  category: string;
  owner: string;
  description: string;
}

export const sources: Source[] = [
  { id: "src-1", name: "YC Company Directory", type: "Web Scrape", status: "Verified", confidence: "High", records: 4200, lastUpdated: "2024-03-15T10:30:00Z", category: "Company Data", owner: "System", description: "Official YC company directory scrape" },
  { id: "src-2", name: "Crunchbase API Feed", type: "API", status: "Verified", confidence: "High", records: 12800, lastUpdated: "2024-03-14T08:00:00Z", category: "Company Data", owner: "System", description: "Crunchbase company and funding data" },
  { id: "src-3", name: "LinkedIn Profiles Export", type: "Dataset", status: "Ingested", confidence: "Medium", records: 890, lastUpdated: "2024-03-10T14:22:00Z", category: "People", owner: "analyst-1", description: "Founder LinkedIn profile dataset" },
  { id: "src-4", name: "SEC Filings Parser", type: "API", status: "Verified", confidence: "High", records: 340, lastUpdated: "2024-03-13T16:45:00Z", category: "Financial", owner: "System", description: "Automated SEC EDGAR filing extraction" },
  { id: "src-5", name: "News Articles Corpus", type: "Web Scrape", status: "Ingested", confidence: "Medium", records: 5600, lastUpdated: "2024-03-12T09:15:00Z", category: "Media", owner: "System", description: "Tech news articles mentioning YC companies" },
  { id: "src-6", name: "Twitter/X Social Feed", type: "API", status: "Stale", confidence: "Low", records: 23400, lastUpdated: "2024-02-28T11:00:00Z", category: "Social", owner: "System", description: "Social media mentions and sentiment" },
  { id: "src-7", name: "Manual Company Notes", type: "Manual Entry", status: "Verified", confidence: "High", records: 45, lastUpdated: "2024-03-15T09:00:00Z", category: "Company Data", owner: "analyst-2", description: "Hand-curated company research notes" },
  { id: "src-8", name: "Glassdoor Reviews", type: "Web Scrape", status: "Pending", confidence: "None", records: 0, lastUpdated: "2024-03-15T12:00:00Z", category: "People", owner: "System", description: "Employee reviews — awaiting scrape approval" },
  { id: "src-9", name: "Patent Database", type: "API", status: "Failed", confidence: "None", records: 0, lastUpdated: "2024-03-14T22:30:00Z", category: "IP", owner: "System", description: "USPTO patent filings — API rate limit exceeded" },
  { id: "src-10", name: "GitHub Activity Feed", type: "API", status: "Ingested", confidence: "Medium", records: 1800, lastUpdated: "2024-03-11T07:30:00Z", category: "Technical", owner: "System", description: "Open-source activity for developer tool companies" },
  { id: "src-11", name: "Pitch Deck Archive", type: "Document", status: "Ingested", confidence: "Medium", records: 120, lastUpdated: "2024-03-09T15:00:00Z", category: "Financial", owner: "analyst-1", description: "Uploaded pitch decks and investor presentations" },
  { id: "src-12", name: "Job Posting Aggregator", type: "Web Scrape", status: "Verified", confidence: "High", records: 2300, lastUpdated: "2024-03-15T06:00:00Z", category: "Company Data", owner: "System", description: "Active job listings across major boards" },
];

// ─── Decision Types ─────────────────────────────────────────────────────────

export type DecisionStage = "Proposed" | "Under Review" | "Approved" | "In Execution" | "Complete" | "Rejected";
export type DecisionPriority = "Critical" | "High" | "Medium" | "Low";

export interface Decision {
  id: string;
  title: string;
  type: string;
  stage: DecisionStage;
  priority: DecisionPriority;
  description: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  entities: string[]; // company IDs
  approvedBy?: string;
}

export const decisions: Decision[] = [
  { id: "dec-1", title: "Investigate AI/ML Cluster Overlap", type: "Analysis", stage: "In Execution", priority: "High", description: "Analyze competitive dynamics between Acme AI, LangCore, and DevForge in the AI tooling space.", assignee: "analyst-1", createdAt: "2024-03-10T09:00:00Z", updatedAt: "2024-03-15T11:30:00Z", entities: ["c1", "c17", "c4"], approvedBy: "lead-1" },
  { id: "dec-2", title: "Flag SolarGrid for Impact Assessment", type: "Assessment", stage: "Approved", priority: "Medium", description: "Evaluate SolarGrid's social impact metrics and ESG alignment for portfolio review.", assignee: "analyst-2", createdAt: "2024-03-08T14:00:00Z", updatedAt: "2024-03-14T10:00:00Z", entities: ["c13"], approvedBy: "lead-1" },
  { id: "dec-3", title: "Monitor CryptoLedger Wind-Down", type: "Monitoring", stage: "Under Review", priority: "Low", description: "Track CryptoLedger's inactive status and potential asset disposition.", assignee: "analyst-1", createdAt: "2024-03-12T08:00:00Z", updatedAt: "2024-03-13T16:00:00Z", entities: ["c10"] },
  { id: "dec-4", title: "Cross-Reference Founder Networks", type: "Analysis", stage: "Proposed", priority: "High", description: "Map founder connections across W24 batch to identify collaboration opportunities.", assignee: "unassigned", createdAt: "2024-03-14T11:00:00Z", updatedAt: "2024-03-14T11:00:00Z", entities: ["c1", "c3", "c6", "c11", "c17", "c20"] },
  { id: "dec-5", title: "Validate HealthBridge Triage Accuracy", type: "Verification", stage: "In Execution", priority: "Critical", description: "Confirm AI triage accuracy claims against published clinical benchmarks.", assignee: "analyst-2", createdAt: "2024-03-05T10:00:00Z", updatedAt: "2024-03-15T09:45:00Z", entities: ["c2"], approvedBy: "lead-2" },
  { id: "dec-6", title: "Acquisition Pattern Analysis", type: "Analysis", stage: "Complete", priority: "Medium", description: "Completed analysis of S22 batch acquisition patterns — LogiTrack and PetLoop case studies.", assignee: "analyst-1", createdAt: "2024-02-20T09:00:00Z", updatedAt: "2024-03-01T14:00:00Z", entities: ["c7", "c18"], approvedBy: "lead-1" },
  { id: "dec-7", title: "SecureID Compliance Review", type: "Compliance", stage: "Under Review", priority: "High", description: "Review biometric data handling practices against GDPR and SOC2 requirements.", assignee: "analyst-2", createdAt: "2024-03-11T13:00:00Z", updatedAt: "2024-03-14T17:00:00Z", entities: ["c8"] },
  { id: "dec-8", title: "FarmSense Market Expansion Potential", type: "Assessment", stage: "Approved", priority: "Medium", description: "Assess FarmSense's readiness for expansion beyond East Africa.", assignee: "analyst-1", createdAt: "2024-03-07T10:00:00Z", updatedAt: "2024-03-13T12:00:00Z", entities: ["c9"], approvedBy: "lead-2" },
  { id: "dec-9", title: "Refresh Stale Social Data", type: "Maintenance", stage: "Proposed", priority: "Low", description: "Twitter/X feed has been stale for 15 days. Investigate API access and refresh.", assignee: "unassigned", createdAt: "2024-03-15T08:00:00Z", updatedAt: "2024-03-15T08:00:00Z", entities: [] },
  { id: "dec-10", title: "NomadPay Regulatory Risk Flag", type: "Risk", stage: "In Execution", priority: "Critical", description: "Evaluate cross-border payment regulatory exposure across Singapore, EU, and US jurisdictions.", assignee: "analyst-2", createdAt: "2024-03-06T09:00:00Z", updatedAt: "2024-03-15T10:00:00Z", entities: ["c5"], approvedBy: "lead-1" },
  { id: "dec-11", title: "BuildRight Due Diligence Package", type: "Assessment", stage: "Proposed", priority: "High", description: "Prepare comprehensive due diligence package for BuildRight Series A evaluation.", assignee: "unassigned", createdAt: "2024-03-15T07:00:00Z", updatedAt: "2024-03-15T07:00:00Z", entities: ["c16"] },
  { id: "dec-12", title: "UrbanFlow / RoboChef Partnership Eval", type: "Analysis", stage: "Under Review", priority: "Medium", description: "Evaluate potential synergies between UrbanFlow's CV capabilities and RoboChef's robotics platform.", assignee: "analyst-1", createdAt: "2024-03-13T09:00:00Z", updatedAt: "2024-03-15T08:30:00Z", entities: ["c20", "c11"] },
  { id: "dec-13", title: "Archive Completed Pitch Deck Review", type: "Maintenance", stage: "Complete", priority: "Low", description: "Archived 45 reviewed pitch decks from Q4 2023 to cold storage.", assignee: "analyst-1", createdAt: "2024-02-15T10:00:00Z", updatedAt: "2024-02-28T16:00:00Z", entities: [] },
  { id: "dec-14", title: "EduVerse Content Safety Audit", type: "Compliance", stage: "Rejected", priority: "Medium", description: "Proposed automated content safety audit — rejected, manual review preferred for K-12 context.", assignee: "analyst-2", createdAt: "2024-03-09T11:00:00Z", updatedAt: "2024-03-12T14:00:00Z", entities: ["c6"] },
];

// ─── Sample Query Results ────────────────────────────────────────────────────

export const sampleQueries = [
  {
    query: "Which AI companies from W24 are hiring?",
    answer: "Acme AI and LangCore are both W24 AI/ML companies currently hiring. Acme AI (12 employees, SF) focuses on document processing, while LangCore (9 employees, SF) builds LLM evaluation infrastructure.",
    entities: ["c1", "c17"],
  },
  {
    query: "Show climate-focused startups with international presence",
    answer: "GreenStack (London, W24) provides carbon accounting APIs for fintech. SolarGrid (Mumbai, W23) builds community solar microgrids. Both are active and operating outside the US.",
    entities: ["c3", "c13"],
  },
  {
    query: "What companies were acquired?",
    answer: "LogiTrack (Chicago, S22) was acquired — they built real-time fleet tracking for last-mile delivery with 55 employees. PetLoop (Portland, S22) was also acquired — a subscription pet wellness platform with 40 employees.",
    entities: ["c7", "c18"],
  },
];
