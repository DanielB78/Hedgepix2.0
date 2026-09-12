import type { AlpacaHourlyBar } from "./alpacaHourlyBars.js";

/** Tunable threshold: flag when abs(event) > multiplier × typical abs move. */
export const ABNORMAL_MOVE_MULTIPLIER = Number(
  process.env.NEWS_ABNORMAL_MOVE_MULTIPLIER ?? "2.5",
);

export const EVENT_WINDOW_MAX_MS = 24 * 60 * 60 * 1000;
export const BASELINE_LOOKBACK_DAYS = 30;

export type EventWindow = {
  windowStart: Date;
  windowEnd: Date;
  windowHours: number;
  /** True when window_end is capped at published_at + 24h. */
  windowComplete: boolean;
};

export type MoveMeasurement = {
  startPrice: number;
  endPrice: number;
  eventReturnPct: number;
  /** Index distance between start and end bars (0 = same bar). */
  spanBars: number;
  startBarTime: number;
  endBarTime: number;
};

export type AbnormalAssessment = {
  historicalTypicalMovePct: number | null;
  abnormalityRatio: number | null;
  isAbnormal: boolean;
};

/** Event window: published_at → min(now, published_at + 24h). */
export function computeEventWindow(
  publishedAt: Date,
  now: Date,
): EventWindow {
  const maxEnd = new Date(publishedAt.getTime() + EVENT_WINDOW_MAX_MS);
  const windowComplete = now.getTime() >= maxEnd.getTime();
  const windowEnd = windowComplete ? maxEnd : now;
  const windowHours = Math.max(
    0,
    (windowEnd.getTime() - publishedAt.getTime()) / (60 * 60 * 1000),
  );
  return {
    windowStart: publishedAt,
    windowEnd,
    windowHours,
    windowComplete,
  };
}

/**
 * Start = first bar at/after window start (next available market price if closed).
 * End = last bar at/before window end at or after the start bar.
 * Prices: open of start bar → close of end bar (same bar → open→close of that hour).
 */
export function measureEventMove(
  bars: AlpacaHourlyBar[],
  windowStartMs: number,
  windowEndMs: number,
): MoveMeasurement | null {
  if (!bars.length || windowEndMs < windowStartMs) return null;

  let startIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i]!.t >= windowStartMs) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;

  let endIdx = -1;
  for (let i = bars.length - 1; i >= startIdx; i--) {
    if (bars[i]!.t <= windowEndMs) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return null;

  const startBar = bars[startIdx]!;
  const endBar = bars[endIdx]!;
  const startPrice = startBar.o > 0 ? startBar.o : startBar.c;
  const endPrice = endBar.c;
  if (!(startPrice > 0) || !(endPrice > 0)) return null;

  return {
    startPrice,
    endPrice,
    eventReturnPct: ((endPrice - startPrice) / startPrice) * 100,
    spanBars: endIdx - startIdx,
    startBarTime: startBar.t,
    endBarTime: endBar.t,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Typical absolute % move over equivalent bar-span windows in the prior ~30 days
 * before the event (bars strictly before windowStart).
 */
export function typicalHistoricalAbsMovePct(
  bars: AlpacaHourlyBar[],
  windowStartMs: number,
  spanBars: number,
  lookbackDays = BASELINE_LOOKBACK_DAYS,
): number | null {
  const lookbackStart = windowStartMs - lookbackDays * 24 * 60 * 60 * 1000;
  const hist = bars.filter(
    (b) => b.t >= lookbackStart && b.t < windowStartMs,
  );
  if (hist.length < 2) return null;

  const span = Math.max(0, spanBars);
  const moves: number[] = [];

  if (span === 0) {
    for (const bar of hist) {
      const start = bar.o > 0 ? bar.o : bar.c;
      if (!(start > 0) || !(bar.c > 0)) continue;
      moves.push(Math.abs(((bar.c - start) / start) * 100));
    }
  } else {
    for (let i = 0; i + span < hist.length; i++) {
      const a = hist[i]!;
      const b = hist[i + span]!;
      const start = a.o > 0 ? a.o : a.c;
      if (!(start > 0) || !(b.c > 0)) continue;
      moves.push(Math.abs(((b.c - start) / start) * 100));
    }
  }

  return median(moves);
}

export function assessAbnormality(
  eventReturnPct: number,
  historicalTypicalMovePct: number | null,
  multiplier = ABNORMAL_MOVE_MULTIPLIER,
): AbnormalAssessment {
  if (
    historicalTypicalMovePct == null ||
    !Number.isFinite(historicalTypicalMovePct) ||
    historicalTypicalMovePct < 0
  ) {
    return {
      historicalTypicalMovePct,
      abnormalityRatio: null,
      isAbnormal: false,
    };
  }
  const typical = Math.max(historicalTypicalMovePct, 1e-9);
  const ratio = Math.abs(eventReturnPct) / typical;
  return {
    historicalTypicalMovePct,
    abnormalityRatio: ratio,
    isAbnormal: Math.abs(eventReturnPct) > multiplier * typical,
  };
}

export function evaluateTickerMove(
  bars: AlpacaHourlyBar[],
  publishedAt: Date,
  now: Date,
  multiplier = ABNORMAL_MOVE_MULTIPLIER,
): {
  window: EventWindow;
  measurement: MoveMeasurement | null;
  assessment: AbnormalAssessment;
} {
  const window = computeEventWindow(publishedAt, now);
  const measurement = measureEventMove(
    bars,
    window.windowStart.getTime(),
    window.windowEnd.getTime(),
  );
  if (!measurement) {
    return {
      window,
      measurement: null,
      assessment: {
        historicalTypicalMovePct: null,
        abnormalityRatio: null,
        isAbnormal: false,
      },
    };
  }
  const typical = typicalHistoricalAbsMovePct(
    bars,
    window.windowStart.getTime(),
    measurement.spanBars,
  );
  return {
    window,
    measurement,
    assessment: assessAbnormality(
      measurement.eventReturnPct,
      typical,
      multiplier,
    ),
  };
}
