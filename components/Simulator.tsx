"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AVERAGE_JACKPOT,
  EXPECTED_WEEKS,
  FIRST_PRIZE_ODDS,
  MEDIAN_WEEKS,
  RANK_LABEL,
  RANK_RULE,
  TICKETS_PER_WEEK,
  TICKET_PRICE,
  LottoSimulation,
  emptySnapshot,
  jackpotProbability,
  type Rank,
  type SimulationEvent,
  type SimulationSnapshot,
  type WeekOutcome,
} from "@/lib/lotto";

type Speed = {
  id: string;
  label: string;
  weeks: number;
  interval: number;
};

const SPEEDS: Speed[] = [
  { id: "normal", label: "0.1초/주", weeks: 1, interval: 100 },
  { id: "fast", label: "0.02초/주", weeks: 1, interval: 20 },
  { id: "rapid", label: "500주/초", weeks: 10, interval: 20 },
  { id: "turbo", label: "8,000주/초", weeks: 160, interval: 20 },
];

const nf = new Intl.NumberFormat("ko-KR");

function fmt(value: number): string {
  return nf.format(Math.round(value));
}

function yearsLabel(weeks: number): string {
  const years = weeks / 52.1775;
  if (years >= 100) return fmt(years);
  return years.toFixed(1);
}

function wons(value: number): string {
  return `₩${fmt(value)}`;
}

function percentLabel(probability: number): string {
  const pct = probability * 100;
  if (pct === 0) return "0";
  if (pct < 0.01) return pct.toFixed(4);
  if (pct < 1) return pct.toFixed(3);
  return pct.toFixed(2);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 ${seconds % 60}초`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 ${minutes % 60}분`;
}

function matchesOf(ticket: number[], winning: number[], bonus?: number) {
  const winSet = new Set(winning);
  let matches = 0;
  let hasBonus = false;
  for (const n of ticket) {
    if (winSet.has(n)) matches++;
    else if (bonus !== undefined && n === bonus) hasBonus = true;
  }
  return { matches, hasBonus };
}

function Ball({
  value,
  variant = "win",
}: {
  value: number;
  variant?: "win" | "bonus" | "hit" | "miss" | "small";
}) {
  return (
    <span className={`ball ball--${variant}`} aria-label={`${value}번`}>
      {value}
    </span>
  );
}

function RankTag({ rank, matches }: { rank: number; matches: number }) {
  if (!rank) {
    return <span className="rank-tag rank-tag--none">{matches}개 일치</span>;
  }
  return (
    <span className={`rank-tag rank-tag--r${rank}`}>
      {RANK_LABEL[rank as Rank]} · {matches}개
    </span>
  );
}

function RankPill({ rank }: { rank: Rank }) {
  return <span className={`rank-pill rank-pill--r${rank}`}>{RANK_LABEL[rank]}</span>;
}

function Icon({ name }: { name: "play" | "pause" | "reset" | "bolt" | "close" }) {
  if (name === "play") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M4 2.6v10.8c0 .6.66.96 1.16.64l8.1-5.4a.77.77 0 0 0 0-1.28l-8.1-5.4A.77.77 0 0 0 4 2.6Z" fill="currentColor" />
      </svg>
    );
  }
  if (name === "pause") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="3.2" y="2.4" width="3.4" height="11.2" rx="1.1" fill="currentColor" />
        <rect x="9.4" y="2.4" width="3.4" height="11.2" rx="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (name === "reset") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M8 2.6a5.4 5.4 0 1 0 5.08 7.22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 0.9v4.2H3.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "bolt") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M9.2 1 3 9.1h4l-.9 5.9L13 6.9H8.8L9.2 1Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="m3.5 3.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function WinningNumbers({ week, bonus }: { week: number[]; bonus: number }) {
  return (
    <div className="win-row">
      <div className="ball-group">
        {week.map((n) => (
          <Ball key={n} value={n} />
        ))}
      </div>
      <span className="plus" aria-hidden="true">
        +
      </span>
      <div className="bonus-group">
        <Ball value={bonus} variant="bonus" />
        <span className="bonus-label">보너스</span>
      </div>
    </div>
  );
}

function TicketNumbers({
  numbers,
  winning,
  bonus,
  highlight,
}: {
  numbers: number[];
  winning: number[];
  bonus: number;
  highlight: boolean;
}) {
  const winSet = new Set(winning);
  return (
    <div className="ticket-balls">
      {numbers.map((n, i) => {
        const variant = !highlight ? "miss" : winSet.has(n) ? "hit" : "miss";
        return <Ball key={`${n}-${i}`} value={n} variant={variant} />;
      })}
    </div>
  );
}

function WeekCard({ current, won }: { current: WeekOutcome | null; won: boolean }) {
  if (!current) {
    return (
      <section className="card current-card" aria-label="이번 주 추첨">
        <div className="card-head">
          <div>
            <p className="eyebrow">THIS WEEK</p>
            <h2 className="card-title">이번 주 추첨</h2>
          </div>
        </div>
        <p className="empty-inline">첫 번째 주를 구매하는 중입니다…</p>
      </section>
    );
  }

  const { matches, hasBonus } = matchesOf(current.bestNumbers, current.winning, current.bonus);
  const rank = matches === 6 ? 1 : matches === 5 && hasBonus ? 2 : matches === 5 ? 3 : matches === 4 ? 4 : matches === 3 ? 5 : 0;

  return (
    <section className={`card current-card${won ? " current-card--won" : ""}`} aria-label="이번 주 추첨">
      <div className="card-head">
        <div>
          <p className="eyebrow">THIS WEEK · 6 / 45</p>
          <h2 className="card-title">이번 주 추첨</h2>
        </div>
        <span className="week-chip">{fmt(current.week)}주차</span>
      </div>

      <WinningNumbers key={current.week} week={current.winning} bonus={current.bonus} />

      <div className="divider" />

      <div className="my-ticket">
        <div className="my-ticket-head">
          <span className="tiny-label">내 최고 티켓</span>
          <RankTag rank={rank} matches={matches} />
        </div>
        <TicketNumbers
          numbers={current.bestNumbers}
          winning={current.winning}
          bonus={current.bonus}
          highlight={rank > 0}
        />
      </div>

      <p className="draw-note">
        100장 중 최고 기록입니다. 이번 주 당첨 번호와 비교해 보세요.
      </p>
    </section>
  );
}

function TicketGrid({ current }: { current: WeekOutcome | null }) {
  const ranks = current?.ranks ?? new Array(100).fill(0);
  const counts = current?.counts ?? [0, 0, 0, 0, 0, 0];

  return (
    <section className="card grid-card" aria-label="이번 주 구매한 100장">
      <div className="card-head">
        <div>
          <p className="eyebrow">YOUR 100 TICKETS</p>
          <h2 className="card-title">이번 주 구매한 100장</h2>
        </div>
        <div className="legend" aria-hidden="true">
          <span className="legend-item"><i className="swatch swatch--r5" />3개</span>
          <span className="legend-item"><i className="swatch swatch--r4" />4개</span>
          <span className="legend-item"><i className="swatch swatch--r3" />5개</span>
          <span className="legend-item"><i className="swatch swatch--r2" />5+보너스</span>
        </div>
      </div>

      <div className="ticket-grid">
        {ranks.map((rank, i) => (
          <span
            key={i}
            className={`cell cell--r${rank || 0}`}
            title={`${i + 1}번 티켓 · ${rank ? `${RANK_LABEL[rank as Rank]} (${RANK_RULE[rank as Rank]})` : "낙첨"}`}
          />
        ))}
      </div>

      <div className="grid-foot">
        <span>3개 일치 <strong>{counts[5]}</strong>장</span>
        <span>4개 일치 <strong>{counts[4]}</strong>장</span>
        <span>5개 일치 <strong>{counts[3]}</strong>장</span>
        {counts[2] > 0 && <span className="grid-foot-hot">5+보너스 <strong>{counts[2]}</strong>장</span>}
      </div>
    </section>
  );
}

function StatsCard({ snap }: { snap: SimulationSnapshot }) {
  return (
    <section className="card" aria-label="누적 기록">
      <div className="card-head">
        <div>
          <p className="eyebrow">ALL TIME</p>
          <h2 className="card-title">누적 기록</h2>
        </div>
        <span className="count-caption">{fmt(snap.week)}주</span>
      </div>

      <div className="rank-list">
        {([1, 2, 3, 4, 5] as Rank[]).map((rank) => (
          <div className="stat-row" key={rank}>
            <span className="stat-rank">
              <i className={`dot dot--r${rank}`} />
              {RANK_LABEL[rank]}
            </span>
            <span className="stat-rule">{RANK_RULE[rank]}</span>
            <strong className="stat-count">{fmt(snap.counts[rank])}회</strong>
          </div>
        ))}
      </div>

      <div className="best-box">
        <div>
          <span className="tiny-label">이번 실행 최고 기록</span>
          <strong className="best-value">
            {snap.bestRank ? `${RANK_LABEL[snap.bestRank]}` : "아직 없음"}
          </strong>
        </div>
        <span className="best-week">
          {snap.bestRank ? `${fmt(snap.bestWeek)}주차` : "—"}
        </span>
      </div>
    </section>
  );
}

function ProbabilityCard({ snap }: { snap: SimulationSnapshot }) {
  const probability = jackpotProbability(snap.week);
  const pct = probability * 100;

  return (
    <section className="card" aria-label="누적 당첨 확률">
      <div className="card-head">
        <div>
          <p className="eyebrow">PROBABILITY</p>
          <h2 className="card-title">1등이 나왔을 확률</h2>
        </div>
      </div>

      <div className="prob-value">
        {percentLabel(probability)}
        <span>%</span>
      </div>

      <div className="prob-bar" role="img" aria-label={`누적 1등 확률 ${percentLabel(probability)}퍼센트`}>
        <div className="prob-fill" style={{ width: `${Math.max(pct, pct > 0 ? 0.6 : 0)}%` }} />
        <i className="prob-tick" />
      </div>
      <div className="prob-scale">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      <p className="prob-note">
        지금까지 구매한 <strong>{fmt(snap.tickets)}장</strong> 기준, 1등이 한 번이라도
        나왔을 확률입니다. 중앙값은 <strong>{fmt(MEDIAN_WEEKS)}주</strong>, 평균은{" "}
        <strong>{fmt(EXPECTED_WEEKS)}주</strong>입니다.
      </p>
    </section>
  );
}

function EventsCard({ events }: { events: SimulationEvent[] }) {
  return (
    <section className="card events-card" aria-label="주요 당첨 기록">
      <div className="card-head">
        <div>
          <p className="eyebrow">HIGHLIGHTS</p>
          <h2 className="card-title">주요 당첨 기록</h2>
        </div>
        <span className="count-caption">3등 이상</span>
      </div>

      {events.length === 0 ? (
        <div className="events-empty">
          <span className="empty-dot" />
          아직 3등 이상 기록이 없습니다. 시뮬레이션을 계속해 보세요.
        </div>
      ) : (
        <ul className="event-list">
          {events.map((event) => {
            const { matches } = matchesOf(event.ticket, event.winning, event.bonus);
            return (
              <li className="event-row" key={`${event.week}-${event.rank}`}>
                <span className="event-week">
                  <strong>{fmt(event.week)}</strong>
                  <span>주</span>
                </span>
                <RankPill rank={event.rank} />
                <div className="mini-balls">
                  {event.winning.map((n) => (
                    <span className="mini-ball" key={n}>{n}</span>
                  ))}
                  <span className="mini-plus">+</span>
                  <span className="mini-ball mini-ball--bonus">{event.bonus}</span>
                </div>
                <span className="event-match">{matches}개 일치</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FactCard() {
  return (
    <section className="fact-card" aria-label="시뮬레이션 정보">
      <p className="eyebrow">SIMULATION FACTS</p>
      <div className="fact-row">
        <span>추첨 방식</span>
        <strong>6 / 45 + 보너스</strong>
      </div>
      <div className="fact-row">
        <span>구매</span>
        <strong>매주 {TICKETS_PER_WEEK}장 · {wons(TICKETS_PER_WEEK * TICKET_PRICE)}</strong>
      </div>
      <div className="fact-row">
        <span>1등 확률</span>
        <strong>1 / {fmt(FIRST_PRIZE_ODDS)}</strong>
      </div>
      <div className="fact-row">
        <span>기대 소요</span>
        <strong>{fmt(EXPECTED_WEEKS)}주 · 약 {fmt(EXPECTED_WEEKS / 52.1775)}년</strong>
      </div>
    </section>
  );
}

function WinOverlay({
  snap,
  onClose,
  onRestart,
}: {
  snap: SimulationSnapshot;
  onClose: () => void;
  onRestart: () => void;
}) {
  const winner = snap.winner;
  if (!winner) return null;

  const years = winner.week / 52.1775;
  const net = AVERAGE_JACKPOT - snap.spent;
  const isLoss = net < 0;
  const netText = `${isLoss ? "-" : ""}${(Math.abs(net) / 100_000_000).toFixed(1)}억원`;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="win-card">
        <div className="win-halo" aria-hidden="true" />
        <div className="sparks" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => <i key={i} />)}
        </div>

        <p className="win-eyebrow">JACKPOT</p>
        <h2 className="win-title" id="win-title">1등에 당첨됐습니다</h2>
        <p className="win-sub">
          <strong>{fmt(winner.week)}주</strong> 만의 1등 · 약 {yearsLabel(winner.week)}년
        </p>

        <div className="win-draw">
          {winner.winning.map((n) => <Ball key={n} value={n} />)}
          <span className="mini-plus">+</span>
          <Ball value={winner.bonus} variant="bonus" />
        </div>

        <div className="win-stats">
          <div>
            <span>총 구매 금액</span>
            <strong>{wons(snap.spent)}</strong>
          </div>
          <div>
            <span>예상 당첨금</span>
            <strong>{wons(AVERAGE_JACKPOT)}</strong>
          </div>
          <div>
            <span>손익</span>
            <strong className={`win-net${isLoss ? " is-loss" : ""}`}>약 {netText}</strong>
          </div>
        </div>

        {isLoss && (
          <p className="win-loss-note">
            구매 금액이 당첨금보다 커서 손실입니다. 1등은 나왔지만 수지는 적자입니다.
          </p>
        )}

        <div className="win-actions">
          <button type="button" className="btn btn--primary" onClick={onRestart}>
            <Icon name="reset" />
            다시 시뮬레이션
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="win-foot">
          1등 당첨금은 평균 20억원으로 가정한 세전 금액입니다.
        </p>
      </div>
    </div>
  );
}

export default function Simulator() {
  const [snap, setSnap] = useState<SimulationSnapshot>(emptySnapshot);
  const [running, setRunning] = useState(false);
  const [speedId, setSpeedId] = useState<string>("normal");
  const [showWin, setShowWin] = useState(false);

  const simRef = useRef<LottoSimulation | null>(null);
  const runningRef = useRef(false);
  const wonRef = useRef(false);
  const speedRef = useRef<Speed>(SPEEDS[0]);
  const accRef = useRef(0);
  const lastTsRef = useRef(0);

  const speed = useMemo(
    () => SPEEDS.find((s) => s.id === speedId) ?? SPEEDS[0],
    [speedId],
  );
  const rate = Math.round((speed.weeks * 1000) / speed.interval);

  useEffect(() => {
    const sim = new LottoSimulation((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    simRef.current = sim;
    sim.step(true);
    setSnap(sim.snapshot());
    setRunning(true);
    runningRef.current = true;
    wonRef.current = false;
    accRef.current = 0;
    lastTsRef.current = 0;

    let raf = 0;
    let lastCommit = 0;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);

      if (!runningRef.current || wonRef.current) {
        lastTsRef.current = 0;
        return;
      }

      const currentSim = simRef.current;
      if (!currentSim) return;

      if (lastTsRef.current === 0) {
        lastTsRef.current = ts;
        return;
      }

      let dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (dt > 250) dt = 250;
      accRef.current += dt;

      const currentSpeed = speedRef.current;
      let steps = 0;

      while (accRef.current >= currentSpeed.interval && steps < 3) {
        accRef.current -= currentSpeed.interval;
        steps++;

        for (let i = 0; i < currentSpeed.weeks; i++) {
          const outcome = currentSim.step(i === currentSpeed.weeks - 1);
          if (!outcome) break;
          if (outcome.bestRank === 1) {
            wonRef.current = true;
            break;
          }
        }
        if (wonRef.current) break;
      }

      if (steps === 0) return;
      if (ts - lastCommit < 70 && !wonRef.current) return;

      lastCommit = ts;
      const next = currentSim.snapshot();
      setSnap(next);

      if (wonRef.current) {
        runningRef.current = false;
        setRunning(false);
        setShowWin(true);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!showWin) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowWin(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [showWin]);

  const toggleRunning = useCallback(() => {
    if (wonRef.current) {
      setShowWin(true);
      return;
    }
    const next = !runningRef.current;
    runningRef.current = next;
    setRunning(next);
    accRef.current = 0;
    lastTsRef.current = 0;
  }, []);

  const reset = useCallback(() => {
    const sim = new LottoSimulation((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    simRef.current = sim;
    sim.step(true);
    setSnap(sim.snapshot());
    wonRef.current = false;
    runningRef.current = true;
    setRunning(true);
    setShowWin(false);
    accRef.current = 0;
    lastTsRef.current = 0;
  }, []);

  const changeSpeed = useCallback((next: Speed) => {
    speedRef.current = next;
    setSpeedId(next.id);
    accRef.current = 0;
    lastTsRef.current = 0;
  }, []);

  const showResultFast = useCallback(() => {
    const turbo = SPEEDS[SPEEDS.length - 1];
    speedRef.current = turbo;
    setSpeedId(turbo.id);
    accRef.current = 0;
    lastTsRef.current = 0;
    if (!wonRef.current) {
      runningRef.current = true;
      setRunning(true);
    }
  }, []);

  const status = snap.winner ? "JACKPOT" : running ? "RUNNING" : "PAUSED";
  const etaSeconds = EXPECTED_WEEKS / rate;
  const current = snap.current;

  return (
    <div className="page" data-fast={speed.id === "rapid" || speed.id === "turbo"}>
      <header className="site-header">
        <div className="brand">
          <i className="brand-mark" aria-hidden="true" />
          <span>LOTTO<span className="brand-soft">LAB</span></span>
        </div>
        <p className="header-meta">
          <span className={`live-dot${running ? " is-live" : ""}`} aria-hidden="true" />
          6/45 · 100 tickets / week
        </p>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow hero-eyebrow">JACKPOT SIMULATION</p>
          <h1>
            1등까지, <span className="grad-text">몇 주</span>?
          </h1>
          <p className="lede">
            매주 100장씩 6/45 로또를 삽니다. 0.1초마다 한 주가 지나가고,
            1등이 나오는 순간 멈춥니다.
          </p>
          <div className="hero-chips" aria-label="시뮬레이션 조건">
            <span>매주 100장</span>
            <span>장당 1,000원</span>
            <span>1등 확률 1 / {fmt(FIRST_PRIZE_ODDS)}</span>
          </div>
        </section>

        <section className="panel" aria-label="시뮬레이션 현황">
          <div className="week-top">
            <div className="week-main">
              <div className="status-row">
                <span className="status-label">
                  <i className={`status-dot${running ? " is-live" : ""}${snap.winner ? " is-win" : ""}`} />
                  {status}
                </span>
                <span className="status-sep" />
                <span className="status-sub">WEEK BY WEEK</span>
              </div>
              <div className="week-value">
                <span className="week-num">{fmt(snap.week)}</span>
                <span className="week-unit">주</span>
              </div>
              <p className="week-meta">
                약 <strong>{yearsLabel(snap.week)}년</strong>째 구매 중
                <span className="meta-dot">·</span>
                {fmt(snap.tickets)}장 보유
              </p>
            </div>

            <div className="mini-stats">
              <div className="mini-stat">
                <span>구매한 티켓</span>
                <strong>{fmt(snap.tickets)}장</strong>
              </div>
              <div className="mini-stat">
                <span>누적 구매 금액</span>
                <strong>{wons(snap.spent)}</strong>
              </div>
              <div className="mini-stat">
                <span>최고 당첨</span>
                <strong className={snap.bestRank ? "text-accent" : ""}>
                  {snap.bestRank ? RANK_LABEL[snap.bestRank] : "—"}
                </strong>
              </div>
            </div>
          </div>

          <div className="controls">
            <button
              type="button"
              className="btn btn--primary"
              onClick={snap.winner ? () => setShowWin(true) : toggleRunning}
              aria-label={snap.winner ? "당첨 결과 보기" : running ? "일시정지" : "시작"}
            >
              <Icon name={snap.winner ? "play" : running ? "pause" : "play"} />
              {snap.winner ? "결과 보기" : running ? "일시정지" : "시작"}
            </button>

            <button
              type="button"
              className={`btn btn--ghost${snap.winner ? "" : " btn--icon"}`}
              onClick={reset}
              title="다시 시작"
              aria-label="다시 시작"
            >
              <Icon name="reset" />
              {snap.winner && "다시 시작"}
            </button>

            <div className="speed-group" role="group" aria-label="시뮬레이션 속도">
              {SPEEDS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`speed-chip${speed.id === option.id ? " is-active" : ""}`}
                  onClick={() => changeSpeed(option)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn--soft"
              onClick={showResultFast}
              disabled={!!snap.winner}
            >
              <Icon name="bolt" />
              결과까지 바로
            </button>
          </div>

          <p className="controls-note">
            {snap.winner ? (
              <>1등 당첨으로 시뮬레이션이 종료되었습니다. 다시 시작해도 확률은 같습니다.</>
            ) : (
              <>
                현재 {fmt(rate)}주/초
                <span className="meta-dot">·</span>
                기대 당첨(약 {fmt(EXPECTED_WEEKS)}주)까지 약 {formatDuration(etaSeconds)}
                <span className="meta-dot">·</span>
                0.1초/주는 실제 체감 속도입니다
              </>
            )}
          </p>
        </section>

        <div className="dashboard">
          <div className="column">
            <WeekCard current={current} won={!!snap.winner} />
            <TicketGrid current={current} />
            <EventsCard events={snap.events} />
          </div>

          <aside className="column">
            <StatsCard snap={snap} />
            <ProbabilityCard snap={snap} />
            <FactCard />
          </aside>
        </div>
      </main>

      <footer className="site-footer">
        <p>
          실제 추첨과 같은 6/45 확률 구조를 사용한 오락용 시뮬레이션입니다.
          1등 당첨금은 평균 20억원으로 가정합니다.
        </p>
        <p className="footer-tech">Next.js · Vercel ready</p>
      </footer>

      {showWin && snap.winner && (
        <WinOverlay snap={snap} onClose={() => setShowWin(false)} onRestart={reset} />
      )}
    </div>
  );
}
