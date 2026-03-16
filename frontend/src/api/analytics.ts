/**
 * analytics.ts — Legacy thin wrappers superseded by agents.ts.
 *
 * These functions are kept for backward compatibility. Prefer importing
 * getAnalyticsInsights / getGrowthStrategy from @/api/agents instead,
 * which provide full TypeScript types and proper error handling.
 */

import { getAnalyticsInsights, getGrowthStrategy } from "@/api/agents";

export { getAnalyticsInsights, getGrowthStrategy };
