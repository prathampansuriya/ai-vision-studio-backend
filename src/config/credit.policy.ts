import { CreditFeatureType } from '@prisma/client';

export interface FeaturePricingRule {
  feature: CreditFeatureType;
  name: string;
  description: string;
  baseCredits: number;
  unit: string;
  rateDescription: string;
  minimumCredits: number;
}

/**
 * Transparent Centralized Credit Policy
 * Defines exact credit calculation rates for all billable multimodal AI capabilities.
 */
export const CREDIT_POLICY: Record<CreditFeatureType, FeaturePricingRule> = {
  [CreditFeatureType.MULTIMODAL_STREAM]: {
    feature: CreditFeatureType.MULTIMODAL_STREAM,
    name: 'Live Multimodal Video Streaming',
    description: 'High-frequency webcam and screen video frame ingestion and vision analysis',
    baseCredits: 1, // 1 credit per 60 seconds (1 credit/minute)
    unit: 'minutes',
    rateDescription: '1 credit per 60 seconds of active video streaming',
    minimumCredits: 1,
  },
  [CreditFeatureType.AUDIO_USAGE]: {
    feature: CreditFeatureType.AUDIO_USAGE,
    name: 'Voice & Audio Channel',
    description: 'Low-latency microphone audio capture and bidirectional voice dialogue',
    baseCredits: 1, // 1 credit per 120 seconds (0.5 credits/minute)
    unit: 'minutes',
    rateDescription: '1 credit per 120 seconds of real-time audio interaction',
    minimumCredits: 1,
  },
  [CreditFeatureType.LIVE_TRANSCRIPTION]: {
    feature: CreditFeatureType.LIVE_TRANSCRIPTION,
    name: 'Live Speech-to-Text Transcription',
    description: 'Real-time multi-speaker speech recognition and verbatim transcript generation',
    baseCredits: 1,
    unit: 'chunks',
    rateDescription: '1 credit per 100 words or 60 seconds of transcribed speech',
    minimumCredits: 1,
  },
  [CreditFeatureType.VISION_SNAPSHOT]: {
    feature: CreditFeatureType.VISION_SNAPSHOT,
    name: 'High-Resolution Snapshot Analysis',
    description: 'Deep visual frame inspection, OCR text extraction, and object bounding',
    baseCredits: 2,
    unit: 'frames',
    rateDescription: '2 credits per captured and analyzed visual frame',
    minimumCredits: 2,
  },
  [CreditFeatureType.TOOL_EXECUTION]: {
    feature: CreditFeatureType.TOOL_EXECUTION,
    name: 'Autonomous AI Tool Calling',
    description: 'Deterministic tool invocation (code execution, search, math, document analysis)',
    baseCredits: 1,
    unit: 'invocations',
    rateDescription: '1 credit per standard tool invocation, 2 credits for external tools',
    minimumCredits: 1,
  },
  [CreditFeatureType.REPORT_GENERATION]: {
    feature: CreditFeatureType.REPORT_GENERATION,
    name: 'Executive Session Report & Meeting Minutes',
    description: 'Structured multimodal session synthesis, action item extraction, and export',
    baseCredits: 5,
    unit: 'reports',
    rateDescription: '5 credits per structured session report or minutes synthesis',
    minimumCredits: 5,
  },
};

/**
 * AI Model Cost Multipliers
 */
export const MODEL_MULTIPLIERS: Record<string, number> = {
  'gemini-2.0-flash-exp': 1.0,
  'gemini-2.0-flash': 1.0,
  'gemini-1.5-flash': 1.0,
  'gemini-2.0-flash-thinking-exp': 1.5,
  'gemini-1.5-pro': 2.5,
};

/**
 * Default reservation hold values for starting sessions
 */
export const RESERVATION_DEFAULTS = {
  SESSION_START_HOLD: 10, // 10 credits held upon joining a live session (covers ~10 min baseline)
  TOOL_CALL_HOLD: 2, // 2 credits held before executing an external tool
  REPORT_GEN_HOLD: 5, // 5 credits held before generating a session report
  DEFAULT_TTL_SECONDS: 600, // 10-minute hold expiry
};

/**
 * Low credit warning threshold
 */
export const LOW_CREDIT_THRESHOLD = 20;

/**
 * Calculates exact credits required based on actual measured activity
 */
export function calculateUsageCredits(params: {
  feature: CreditFeatureType;
  durationSeconds?: number | null;
  unitsConsumed?: number | null;
  modelUsed?: string | null;
  isExternalTool?: boolean;
}): number {
  const rule = CREDIT_POLICY[params.feature];
  if (!rule) {
    throw new Error(`Unknown credit feature type: ${params.feature}`);
  }

  const modelMultiplier =
    params.modelUsed && MODEL_MULTIPLIERS[params.modelUsed]
      ? MODEL_MULTIPLIERS[params.modelUsed]
      : 1.0;

  let computed = 0;

  switch (params.feature) {
    case CreditFeatureType.MULTIMODAL_STREAM: {
      const seconds = Math.max(0, params.durationSeconds || 0);
      if (seconds === 0) return 0;
      // 1 credit per 60s
      computed = Math.ceil(seconds / 60) * rule.baseCredits;
      break;
    }

    case CreditFeatureType.AUDIO_USAGE: {
      const seconds = Math.max(0, params.durationSeconds || 0);
      if (seconds === 0) return 0;
      // 1 credit per 120s
      computed = Math.ceil(seconds / 120) * rule.baseCredits;
      break;
    }

    case CreditFeatureType.LIVE_TRANSCRIPTION: {
      const units = Math.max(0, params.unitsConsumed || 0);
      if (units === 0) {
        const seconds = Math.max(0, params.durationSeconds || 0);
        computed = Math.ceil(seconds / 60) * rule.baseCredits;
      } else {
        computed = Math.ceil(units / 100) * rule.baseCredits;
      }
      break;
    }

    case CreditFeatureType.VISION_SNAPSHOT: {
      const frames = Math.max(1, params.unitsConsumed || 1);
      computed = frames * rule.baseCredits;
      break;
    }

    case CreditFeatureType.TOOL_EXECUTION: {
      const count = Math.max(1, params.unitsConsumed || 1);
      const perToolCost = params.isExternalTool ? 2 : rule.baseCredits;
      computed = count * perToolCost;
      break;
    }

    case CreditFeatureType.REPORT_GENERATION: {
      const reports = Math.max(1, params.unitsConsumed || 1);
      computed = reports * rule.baseCredits;
      break;
    }

    default:
      computed = rule.baseCredits;
  }

  // Apply model multiplier and ensure minimum floor
  const finalCredits = Math.max(rule.minimumCredits, Math.round(computed * modelMultiplier));
  return finalCredits;
}
