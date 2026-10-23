/**
 * Domain types for Utsav Planner.
 *
 * Everything the user receives is one `Plan`. Three of its four parts —
 * budget, timeline, vendor checklist — are computed by pure functions from the
 * request alone, so they are correct, instant and testable without a model.
 * The fourth, `Personalisation`, is the one place generative AI contributes,
 * and it is validated like any other untrusted input before it is shown.
 */

/** The three occasions named in the brief. */
export type EventType = 'wedding' | 'birthday' | 'community';

export const EVENT_TYPES: readonly EventType[] = ['wedding', 'birthday', 'community'];

/** A validated, normalised planning request. Produced only by `validate.ts`. */
export interface PlanRequest {
  eventType: EventType;
  /** ISO calendar date, YYYY-MM-DD, in the user's local calendar. */
  eventDate: string;
  guests: number;
  /** Total budget in whole rupees. */
  budget: number;
  /** City or town, for venue and vendor context. Optional, at most 60 chars. */
  city: string | null;
  /** What the celebration is for — "Aarav's 5th birthday", "Diwali mela". */
  occasion: string | null;
  /** Free-text wishes: theme, food, must-haves. Untrusted; screened before use. */
  preferences: string | null;
}

// ---------------------------------------------------------------- budget

export interface BudgetLine {
  /** Stable id, referenced by vendors and ideas: "catering", "venue", … */
  id: string;
  label: string;
  /** Fraction of the total this line was allocated (0–1). */
  share: number;
  /** Whole rupees. All lines sum exactly to the total. */
  amount: number;
  /** Rupees per guest for lines that scale with headcount, else null. */
  perGuest: number | null;
}

export type BudgetFlagCode = 'tight_total' | 'tight_catering' | 'generous';

export interface BudgetFlag {
  code: BudgetFlagCode;
  message: string;
}

export interface Budget {
  currency: 'INR';
  total: number;
  perGuest: number;
  lines: BudgetLine[];
  flags: BudgetFlag[];
}

// ---------------------------------------------------------------- timeline

export type Phase = 'foundation' | 'booking' | 'details' | 'final' | 'event';

export interface Milestone {
  id: string;
  title: string;
  phase: Phase;
  /** Days before the event this should be done by. 0 is the event itself. */
  daysBefore: number;
  /** ISO date derived from the event date and `daysBefore`. */
  dueDate: string;
  /** True when `dueDate` is already in the past relative to planning day. */
  overdue: boolean;
  /** Vendor this milestone books, if any. */
  vendorId: string | null;
}

export interface Timeline {
  /** Days between planning day and the event. */
  leadDays: number;
  /** True when the template had to be compressed below half its ideal lead. */
  rushed: boolean;
  milestones: Milestone[];
}

// ---------------------------------------------------------------- vendors

export interface VendorItem {
  id: string;
  label: string;
  /** Which budget line pays for this vendor. */
  budgetLineId: string;
  /** Book-by date, taken from the matching timeline milestone. */
  bookBy: string;
  daysBefore: number;
  /** Questions worth asking before signing. Deterministic defaults; the model
   *  may append personalised ones, which arrive in `Personalisation`. */
  questions: string[];
}

// ---------------------------------------------------------------- AI output

export type IdeaCategory = 'theme' | 'decor' | 'food' | 'activity' | 'favour' | 'invite' | 'other';
export type CostTier = 'low' | 'medium' | 'high';

export interface Idea {
  title: string;
  detail: string;
  category: IdeaCategory;
  costTier: CostTier;
  /** Budget line the idea draws on, or null if it costs nothing. */
  budgetLineId: string | null;
}

export interface Personalisation {
  /** One-paragraph brief back to the user, in their own terms. */
  summary: string;
  ideas: Idea[];
  /** Extra vendor questions, keyed by vendor id. */
  vendorQuestions: Record<string, string[]>;
  /** A sentence per budget line on where to spend and where to save. */
  budgetNotes: Record<string, string>;
  /** Where this came from. `fallback` means the model was unavailable and the
   *  plan shipped with generic, deterministic guidance instead. */
  source: 'model' | 'fallback';
  model: string | null;
  cached: boolean;
}

// ---------------------------------------------------------------- plan

export interface InjectionFinding {
  kind: string;
  detail: string;
  excerpt: string;
  offset: number;
}

export interface Plan {
  request: PlanRequest;
  /** ISO date the plan was generated on; the timeline's "today". */
  plannedOn: string;
  budget: Budget;
  timeline: Timeline;
  vendors: VendorItem[];
  /** Findings from screening the free-text preferences. Shown, never hidden. */
  guard: { injectionFindings: InjectionFinding[] };
}
