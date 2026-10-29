/**
 * Domain types for Utsav Planner.
 *
 * The user receives a `Plan` — budget, timeline, vendor checklist — computed
 * by pure functions from the request alone, so it is correct, instant and
 * testable without a model. Then a `Personalisation` arrives, the one place
 * generative AI contributes, validated like any other untrusted input before
 * it is shown.
 */

import type { EventType } from '../shared/constants';
import type { BudgetLineId } from './budget-data';
import type { COST_TIERS, IDEA_CATEGORIES, SCREENED_FIELDS } from './constants';
import type { VendorId } from './vendors-data';

/** A validated, normalised planning request: from `validate.ts`, or from `refine/apply.ts` through the same validators. */
export interface PlanRequest {
  eventType: EventType;
  /**
   * A calendar date, YYYY-MM-DD, with no time of day or zone. All date code
   * (src/lib/dates.ts) treats it as a UTC calendar day, and "today" is the
   * current UTC date, on the server and in the form alike.
   */
  eventDate: string;
  guests: number;
  /** Total budget in whole rupees. */
  budget: number;
  /** City or town, for venue and vendor context. Optional, at most 60 chars. */
  city: string | null;
  /** What the celebration is for — "Aarav's 5th birthday", "Diwali mela". */
  occasion: string | null;
  /** Free-text wishes: theme, food, must-haves. Untrusted; screened, stripped and fenced before a model sees them. */
  preferences: string | null;
}

// ---------------------------------------------------------------- budget

/** One budget category: its share of the total and its whole-rupee amount. */
export interface BudgetLine {
  /** Stable id, referenced by vendors and ideas: "catering", "venue", … */
  id: BudgetLineId;
  label: string;
  /** Fraction of the total this line was allocated (0–1). */
  share: number;
  /** Whole rupees. All lines sum exactly to the total. */
  amount: number;
  /** Rupees per guest for lines that scale with headcount, else null. */
  perGuest: number | null;
}

type BudgetFlagCode = 'tight_total' | 'tight_catering' | 'generous';

/** The one warning a budget may earn, with the sentence the page shows. */
export interface BudgetFlag {
  code: BudgetFlagCode;
  message: string;
}

/** The user's total split into lines that sum to it exactly, with any warning. */
export interface Budget {
  currency: 'INR';
  total: number;
  perGuest: number;
  lines: BudgetLine[];
  flags: BudgetFlag[];
}

// ---------------------------------------------------------------- timeline

/** Where in the run-up a milestone falls. */
export type Phase = 'foundation' | 'booking' | 'details' | 'final' | 'event';

/** One dated step of the timeline. */
export interface Milestone {
  id: string;
  title: string;
  phase: Phase;
  /** Days before the event this should be done by. 0 is the event itself. */
  daysBefore: number;
  /** ISO date derived from the event date and `daysBefore`. */
  dueDate: string;
  /** Vendor this milestone books, if any. */
  vendorId: VendorId | null;
}

/** The milestones counted back from the event date, compressed when time is short. */
export interface Timeline {
  /** Days between planning day and the event. */
  leadDays: number;
  /** True when the template had to be compressed below half its ideal lead. */
  rushed: boolean;
  milestones: Milestone[];
}

// ---------------------------------------------------------------- vendors

/** One vendor to book: who, paid from which line, by when, and what to ask. */
export interface VendorItem {
  id: VendorId;
  label: string;
  /** Which budget line pays for this vendor. */
  budgetLineId: BudgetLineId;
  /** Book-by date, taken from the matching timeline milestone. */
  bookBy: string;
  daysBefore: number;
  /** Questions worth asking before signing. Deterministic defaults; the model
   *  may append personalised ones, which arrive in `Personalisation`. */
  questions: string[];
}

// ---------------------------------------------------------------- AI output

/** What an idea is about; one of `IDEA_CATEGORIES`. */
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
/** How expensive an idea is; one of `COST_TIERS`. */
export type CostTier = (typeof COST_TIERS)[number];

/** One personalised idea: what to do, how, and the budget line it draws on. */
export interface Idea {
  title: string;
  detail: string;
  category: IdeaCategory;
  costTier: CostTier;
  /** Budget line the idea draws on, or null if it costs nothing. */
  budgetLineId: BudgetLineId | null;
}

/** Who wrote a section of a personalisation: a model, or the deterministic fallback. */
type Source = 'model' | 'fallback';

/** The generative part of a plan, checked against it, with who wrote each section. */
export interface Personalisation {
  /** One-paragraph brief back to the user, in their own terms. */
  summary: string;
  ideas: Idea[];
  /** Extra vendor questions, keyed by vendor id. */
  vendorQuestions: Record<string, string[]>;
  /** A sentence per budget line on where to spend and where to save. */
  budgetNotes: Record<string, string>;
  /**
   * Who wrote each section; `ideas` covers the summary too. The sections come
   * from separate asks, so they can differ, and the page marks each one as the
   * AI's only when its own source is `model`.
   */
  sources: { ideas: Source; vendorQuestions: Source; budgetNotes: Source };
  /** The model that wrote the ideas, or null when they are generic. */
  model: string | null;
  cached: boolean;
}

// ---------------------------------------------------------------- plan

/** A request field written in the visitor's own words; one of `SCREENED_FIELDS`. */
export type ScreenedField = (typeof SCREENED_FIELDS)[number];

/** One stretch of the brief aimed at an AI reader, shown to the user. */
export interface InjectionFinding {
  /** The field the text was found in. */
  field: ScreenedField;
  kind: string;
  detail: string;
  excerpt: string;
  offset: number;
}

/** All a request yields without a model: budget, timeline, vendors, screen findings. */
export interface Plan {
  request: PlanRequest;
  /** ISO date the plan was generated on; the timeline's "today". */
  plannedOn: string;
  budget: Budget;
  timeline: Timeline;
  vendors: VendorItem[];
  /**
   * Findings from screening the occasion name, city and wishes, field by field.
   * Shown to the user; the sentences they sit in never reach a model.
   */
  guard: { injectionFindings: InjectionFinding[] };
}
