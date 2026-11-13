export const NUMBER_POOL = 45;
export const TICKETS_PER_WEEK = 100;
export const TICKET_PRICE = 1_000;
export const FIRST_PRIZE_ODDS = 8_145_060;
export const AVERAGE_JACKPOT = 2_000_000_000;
export const EVENT_LIMIT = 7;

export type Rank = 1 | 2 | 3 | 4 | 5;

export const RANK_LABEL: Record<Rank, string> = {
  1: "1등",
  2: "2등",
  3: "3등",
  4: "4등",
  5: "5등",
};

export const RANK_RULE: Record<Rank, string> = {
  1: "6개 일치",
  2: "5개 + 보너스",
  3: "5개 일치",
  4: "4개 일치",
  5: "3개 일치",
};

export interface WeekOutcome {
  week: number;
  winning: number[];
  bonus: number;
  /** Ranks for all 100 tickets, or null when the week was not captured for display. */
  ranks: number[] | null;
  /** Rank of the best ticket (0 when no prize was won). */
  bestRank: Rank | 0;
  /** The best ticket in the batch. */
  bestNumbers: number[];
  bestMatches: number;
  /** Prize counts for this week, indexed by rank (1-5). */
  counts: number[];
  /** Present only when this week produced a first-prize ticket. */
  jackpotTicket?: number[];
}

export interface SimulationEvent {
  week: number;
  rank: Rank;
  winning: number[];
  bonus: number;
  ticket: number[];
}

export interface WinnerRecord {
  week: number;
  winning: number[];
  bonus: number;
  ticket: number[];
}

export interface SimulationSnapshot {
  week: number;
  tickets: number;
  spent: number;
  counts: number[];
  bestRank: Rank | 0;
  bestWeek: number;
  current: WeekOutcome | null;
  events: SimulationEvent[];
  winner: WinnerRecord | null;
}

/**
 * Small, fast, deterministic PRNG so a run can be reproduced from its seed.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pool = new Uint8Array(NUMBER_POOL);
const pick = new Uint8Array(6);
const mark = new Uint8Array(NUMBER_POOL + 1);
const rankScratch = new Uint8Array(TICKETS_PER_WEEK);

/** Partial Fisher-Yates: leaves six unique numbers in `pick` and the rest in `pool`. */
function drawSix(rng: () => number): void {
  for (let i = 0; i < NUMBER_POOL; i++) pool[i] = i + 1;
  for (let i = 0; i < 6; i++) {
    const j = i + ((rng() * (NUMBER_POOL - i)) | 0);
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
    pick[i] = pool[i];
  }
}

export function simulateWeek(
  rng: () => number,
  week: number,
  capture: boolean,
): WeekOutcome {
  drawSix(rng);

  const winning: number[] = new Array(6);
  mark.fill(0);
  for (let i = 0; i < 6; i++) {
    const n = pick[i];
    winning[i] = n;
    mark[n] = 1;
  }
  const bonus = pool[6 + ((rng() * (NUMBER_POOL - 6)) | 0)];

  const counts = [0, 0, 0, 0, 0, 0];

  let bestRank: Rank | 0 = 0;
  let bestMatches = -1;
  let bestNumbers: number[] = [];
  let jackpotTicket: number[] | null = null;

  for (let t = 0; t < TICKETS_PER_WEEK; t++) {
    drawSix(rng);

    let matches = 0;
    let hasBonus = false;
    for (let i = 0; i < 6; i++) {
      const n = pick[i];
      if (mark[n] === 1) matches++;
      else if (n === bonus) hasBonus = true;
    }

    let rank: Rank | 0 = 0;
    if (matches === 6) rank = 1;
    else if (matches === 5 && hasBonus) rank = 2;
    else if (matches === 5) rank = 3;
    else if (matches === 4) rank = 4;
    else if (matches === 3) rank = 5;

    if (rank !== 0) {
      counts[rank]++;
      if (bestRank === 0 || rank < bestRank) {
        bestRank = rank;
        bestMatches = matches;
        bestNumbers = [pick[0], pick[1], pick[2], pick[3], pick[4], pick[5]];
      }
      if (rank === 1) {
        jackpotTicket = [pick[0], pick[1], pick[2], pick[3], pick[4], pick[5]];
      }
    } else if (bestRank === 0 && matches > bestMatches) {
      bestMatches = matches;
      bestNumbers = [pick[0], pick[1], pick[2], pick[3], pick[4], pick[5]];
    }

    rankScratch[t] = rank;
  }

  if (bestNumbers.length === 0) {
    bestNumbers = [pick[0], pick[1], pick[2], pick[3], pick[4], pick[5]];
  }

  // Keep the ticket layout for the visible week, and always for the jackpot week.
  const ranks =
    capture || bestRank === 1 ? Array.from(rankScratch) : null;

  return {
    week,
    winning,
    bonus,
    ranks,
    bestRank,
    bestNumbers,
    bestMatches,
    counts,
    ...(jackpotTicket ? { jackpotTicket } : {}),
  };
}

export class LottoSimulation {
  readonly rng: () => number;
  week = 0;
  counts = [0, 0, 0, 0, 0, 0];
  bestRank: Rank | 0 = 0;
  bestWeek = 0;
  current: WeekOutcome | null = null;
  events: SimulationEvent[] = [];
  winner: WinnerRecord | null = null;
  jackpotTicket: number[] | null = null;

  constructor(seed: number = Date.now()) {
    this.rng = createRng(seed);
  }

  /** Runs one week. Returns false once the jackpot has already been hit. */
  step(capture: boolean): WeekOutcome | null {
    if (this.winner) return null;

    const week = this.week + 1;
    const outcome = simulateWeek(this.rng, week, capture);
    const jackpot = outcome.jackpotTicket;

    this.week = week;
    for (let rank = 1; rank <= 5; rank++) {
      this.counts[rank] += outcome.counts[rank];
    }

    if (outcome.bestRank !== 0 && (this.bestRank === 0 || outcome.bestRank < this.bestRank)) {
      this.bestRank = outcome.bestRank;
      this.bestWeek = week;
    }

    if (outcome.bestRank !== 0 && outcome.bestRank <= 3) {
      this.events.unshift({
        week,
        rank: outcome.bestRank,
        winning: outcome.winning,
        bonus: outcome.bonus,
        ticket: outcome.bestNumbers,
      });
      if (this.events.length > EVENT_LIMIT) this.events.pop();
    }

    if (outcome.bestRank === 1 && jackpot) {
      this.winner = {
        week,
        winning: outcome.winning,
        bonus: outcome.bonus,
        ticket: jackpot,
      };
      this.jackpotTicket = jackpot;
      this.current = outcome;
    } else if (capture) {
      this.current = outcome;
    }

    return outcome;
  }

  snapshot(): SimulationSnapshot {
    return {
      week: this.week,
      tickets: this.week * TICKETS_PER_WEEK,
      spent: this.week * TICKETS_PER_WEEK * TICKET_PRICE,
      counts: [...this.counts],
      bestRank: this.bestRank,
      bestWeek: this.bestWeek,
      current: this.current,
      events: [...this.events],
      winner: this.winner,
    };
  }
}

export function emptySnapshot(): SimulationSnapshot {
  return {
    week: 0,
    tickets: 0,
    spent: 0,
    counts: [0, 0, 0, 0, 0, 0],
    bestRank: 0,
    bestWeek: 0,
    current: null,
    events: [],
    winner: null,
  };
}

/** Probability that at least one jackpot ticket appeared across every ticket bought so far. */
export function jackpotProbability(weeks: number): number {
  if (weeks <= 0) return 0;
  return 1 - Math.pow(1 - 1 / FIRST_PRIZE_ODDS, weeks * TICKETS_PER_WEEK);
}

/** Number of weeks for a 50% chance at the jackpot. */
export const MEDIAN_WEEKS = Math.ceil(
  Math.log(0.5) / Math.log(1 - (1 - Math.pow(1 - 1 / FIRST_PRIZE_ODDS, TICKETS_PER_WEEK))),
);

export const EXPECTED_WEEKS = FIRST_PRIZE_ODDS / TICKETS_PER_WEEK;
