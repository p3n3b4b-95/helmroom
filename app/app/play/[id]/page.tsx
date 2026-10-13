"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, useCountdown, usePoll } from "@/lib/client";
import { ANSWER_COLORS, Button, Card, ErrorText, Input } from "@/components/ui";

type PQ = { type: "mcq" | "multi" | "poll" | "fill" | "open"; prompt: string; image_url: string | null; options: string[]; points: number };
type Answer = number | number[] | string;
type Answered =
  | { saved: true; answer: unknown }
  | { saved: false; correct: boolean | null; points: number; answer: unknown; correctAnswer: (number | string)[] | null };
type State = {
  session: {
    title: string; kind: string; pacing: string; status: string; closed: boolean; total: number;
    deadline: string | null; allow_change: boolean; show_leaderboard: boolean;
  };
  me: { name: string; score: number; attempt: number; finished: boolean; rank: number | null };
  index: number;
  question: PQ | null;
  secondsLeft: number | null;
  timerOff: boolean;
  answered: Answered | null;
  leaderboard: { name: string; score: number }[];
};
type Feedback = {
  saved: boolean; correct?: boolean | null; points?: number; timedOut?: boolean;
  correctAnswer?: (number | string)[] | null; done?: boolean;
};

function Board({ rows }: { rows: { name: string; score: number }[] }) {
  return (
    <ol className="space-y-1 text-left">
      {rows.map((r, i) => (
        <li key={r.name} className="flex justify-between rounded-md bg-surface px-3 py-2">
          <span>{i + 1}. {r.name}</span><span className="font-semibold">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}

function FeedbackCard({ f, q }: { f: { correct?: boolean | null; points?: number; timedOut?: boolean; correctAnswer?: (number | string)[] | null }; q?: PQ | null }) {
  const right = f.correct ?? null;
  const text = right === null ? "Got it" : right ? "Right" : f.timedOut ? "Time ran out" : "Not this time";
  const shown = q && right === false && f.correctAnswer && f.correctAnswer.length
    ? q.type === "fill" ? String(f.correctAnswer[0]) : (f.correctAnswer as number[]).map((i) => q.options[i]).join(", ")
    : "";
  return (
    <Card className="space-y-2 text-center">
      <p role="status" className={`text-[28px] font-bold leading-[34px] ${right ? "text-success" : right === false ? "text-danger" : ""}`}>{text}</p>
      {(f.points ?? 0) > 0 && <p className="text-lg">+{f.points} points</p>}
      {shown && <p className="text-text-muted">Right answer: {shown}</p>}
    </Card>
  );
}

function QuestionView({ q, index, total, left, timerOff, onSubmit, disabled, selected, saved, confirm }: {
  q: PQ; index: number; total: number; left: number | null; timerOff: boolean; disabled: boolean;
  selected: unknown; saved: boolean; confirm: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const initial = Array.isArray(selected) ? (selected as number[]) : typeof selected === "number" ? [selected] : [];
  const [picked, setPicked] = useState<number[]>(initial);
  const [text, setText] = useState(typeof selected === "string" ? selected : "");
  const choice = q.type === "mcq" || q.type === "poll";
  const lockIn = choice && confirm;

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm text-text-muted">
        <span>Question {index + 1} of {total}</span>
        <span>{timerOff ? "No timer" : left !== null ? `${left}s` : ""}</span>
      </div>
      <h2 className="text-xl font-semibold">{q.prompt}</h2>
      {q.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.image_url} alt="" className="max-h-64 rounded-md" />}
      {(choice || q.type === "multi") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((o, k) => {
            const on = picked.includes(k);
            return (
              <button key={k} disabled={disabled} aria-pressed={on}
                onClick={() => {
                  if (choice && !confirm) { setPicked([k]); onSubmit(k); }
                  else if (choice) setPicked([k]);
                  else setPicked(on ? picked.filter((x) => x !== k) : [...picked, k]);
                }}
                className={`min-h-16 rounded-lg p-4 text-left text-lg font-semibold text-on-answer disabled:opacity-60 ${ANSWER_COLORS[k]} ${on ? "ring-4 ring-text" : ""}`}>
                {q.type === "multi" ? (on ? "☑ " : "☐ ") : ""}{o}
              </button>
            );
          })}
        </div>
      )}
      {lockIn && <Button disabled={disabled || picked.length !== 1} onClick={() => onSubmit(picked[0])}>Lock in answer</Button>}
      {q.type === "multi" && <Button disabled={disabled || picked.length === 0} onClick={() => onSubmit(picked)}>{saved ? "Update answer" : "Submit"}</Button>}
      {(q.type === "fill" || q.type === "open") && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text); }} className="flex gap-2">
          <Input value={text} maxLength={q.type === "fill" ? 200 : 500} aria-label="Your answer" onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={disabled || !text.trim()}>{saved ? "Update" : "Submit"}</Button>
        </form>
      )}
      {saved && <p role="status" className="text-sm text-text-muted">Answer saved. You can change it until the question ends.</p>}
    </div>
  );
}

export default function Play() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = usePoll<State>(`/api/play/${id}`, 1500);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const left = useCountdown(data?.secondsLeft, data?.index);

  if (error?.status === 401) {
    return <Card className="mx-auto max-w-sm text-center"><p>You have not joined this game.</p><Link href="/" className="font-semibold text-accent underline">Enter a code</Link></Card>;
  }
  if (!data) return <p className="text-text-muted">{error ? error.message : "Loading…"}</p>;

  const { session: s, me, question: q } = data;
  const studentPaced = s.pacing === "student";

  async function submit(answer: Answer) {
    if (!q || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api<Feedback>(`/api/play/${id}/answer`, { body: { q_index: data!.index, answer } });
      if (studentPaced) {
        setFb(r);
        setTimeout(() => { setFb(null); setBusy(false); refresh(); }, 1400);
      } else {
        setBusy(false);
        refresh();
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const header = (
    <div className="mb-6 flex items-center justify-between">
      <span className="font-semibold">{me.name}</span>
      <span className="rounded-md bg-surface px-3 py-1 font-semibold">{me.score} pts</span>
    </div>
  );

  const ended = s.status === "ended" || s.closed || me.finished || data.index >= s.total;
  const a = data.answered;
  let body;
  if (fb && studentPaced) {
    body = <FeedbackCard f={fb} q={q} />;
  } else if (s.status === "lobby") {
    body = <Card className="text-center"><p className="text-xl font-semibold">You&apos;re in.</p><p className="text-text-muted">Your teacher will start the game soon.</p></Card>;
  } else if (ended) {
    body = (
      <Card className="space-y-4 text-center">
        <h2 className="text-[28px] font-bold leading-[34px]">{me.finished ? "You finished!" : "Game over"}</h2>
        <p className="text-xl">{me.score} points{me.rank !== null ? ` · rank ${me.rank}` : ""}</p>
        {s.show_leaderboard && <Board rows={data.leaderboard} />}
        <Link href="/" className="font-semibold text-accent underline">Join another game</Link>
      </Card>
    );
  } else if (q && a && !a.saved) {
    body = (
      <div className="space-y-4">
        <FeedbackCard f={a} q={q} />
        <p className="text-center text-text-muted">Next question coming up…</p>
      </div>
    );
  } else if (q) {
    body = (
      <QuestionView key={`${data.index}:${a ? "s" : "n"}`} q={q} index={data.index} total={s.total} left={left}
        timerOff={data.timerOff} onSubmit={submit} disabled={busy}
        selected={a?.answer} saved={!!a?.saved} confirm={studentPaced && s.allow_change} />
    );
  } else {
    body = <p className="text-center text-text-muted">Get ready…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      {header}
      {body}
      <div className="mt-4"><ErrorText>{err}</ErrorText></div>
    </div>
  );
}
