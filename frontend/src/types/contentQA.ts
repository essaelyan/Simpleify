// ─── Content QA Agent (Agent D) — Type Definitions ────────────────────────────

export type QAVerdict = "pass" | "revise" | "reject";

export type QADimension =
  | "hook"
  | "cta"
  | "readability"
  | "platform_fit"
  | "brand_alignment"
  | "duplication"
  | "character_limit";

export type DuplicationRisk = "none" | "low" | "medium" | "high";

export interface QAIssue {
  dimension: QADimension;
  description: string;
  severity: "low" | "medium" | "high";
}

export interface ContentQAResult {
  verdict: QAVerdict;
  overallScore: number;        // 0–100
  hookScore: number;           // 0–100
  ctaScore: number;            // 0–100
  readabilityScore: number;    // 0–100
  platformFitScore: number;    // 0–100
  brandAlignmentScore: number; // 0–100
  duplicationRisk: DuplicationRisk;
  issues: QAIssue[];
  revisionGuidance: string | null; // non-null when verdict = revise or reject
}

export interface QARunResult {
  success: boolean;
  result: ContentQAResult | null;
  failReason?: string;
}
