"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, useCountdown, usePoll } from "@/lib/client";
import { ANSWER_COLORS, Button, Card, ErrorText } from "@/components/ui";

type Player = { name: string; score: number; finished: boolean; answered: number; answered_current: boolean };
type State = {
  session: {
    id: string; code: string; title: string; kind: "live" | "homework"; pacing: "teacher" | "student";
    status: "lobby" | "running" | "ended"; closed: boolean; deadline: string | null; current_index: number; total: number;
  };
  question: { type: string; prompt: string; options: string[]; correct: (number | string)[] } | null;
  secondsLeft: number | null;
  counts: number[] | null;
  texts: string[];
  players: Player[];
};

function Leaderboard({ players }: { players: Player[] }) {
  if (players.length === 0) return <p className="text-text-muted">Nobody yet.</p>;
  return (
    <ol className="space-y-1">
      {players.slice(0, 10).map((p, i) => (
        <li key={p.name} className="flex justify-between rounded-md bg-surface px-3 py-2">
          <span>{i + 1}. {p.name}</span><span className="font-semibold">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Host() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, refresh } = usePoll<State>(`/api/sessions/${id}`, 1500);
  const [err, setErr] = useState("");
  const s = data?.session;
  const left = useCountdown(data?.secondsLeft, s?.current_index);

  useEffect(() => { if (error?.status === 401) router.replace("/login"); }, [error, router]);

  async function act(action: "start" | "next" | "end") {
    setErr("");
    try {
      await api(`/api/sessions/${id}/${action}`, { body: action === "next" ? { index: s?.current_index } : {} });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (error && !data) return <ErrorText>{error.message}</ErrorText>;
  if (!data || !s) return <p className="text-text-muted">Loading…</p>;

  const joinUrl = typeof window !== "undefined" ? window.location.origin : "";
  const live = s.status === "running" && s.pacing === "teacher";
  const last = s.current_index === s.total - 1;
  const answered = data.players.filter((p) => p.answered_current).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-bold leading-[34px]">{s.title}</h1>
        {s.status !== "ended" && <Button variant="danger" onClick={() => confirm("End for everyone?") && act("end")}>End</Button>}
        <Link href={`/report/${s.id}`}><Button variant="secondary">Results</Button></Link>
      </div>
      <ErrorText>{err}</ErrorText>

      {s.status !== "ended" && !s.closed && (
        <Card className="text-center">
          <p className="text-text-muted">Go to <strong>{joinUrl.replace(/^https?:\/\//, "")}</strong> and enter</p>
          <p className="text-[40px] font-bold leading-[44px] tracking-widest" aria-label={`Game code ${s.code.split("").join(" ")}`}>{s.code}</p>
          {s.kind === "homework" && s.deadline && (
            <p className="text-sm text-text-muted">Due {new Date(s.deadline).toLocaleString()}</p>
          )}
        </Card>
      )}

      {s.status === "lobby" && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">{data.players.length} joined</h2>
          <ul className="flex flex-wrap gap-2">
            {data.players.map((p) => <li key={p.name} className="rounded-md bg-surface px-3 py-1">{p.name}</li>)}
          </ul>
          <Button onClick={() => act("start")} disabled={data.players.length === 0}>Start game</Button>
        </Card>
      )}

      {live && data.question && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>Question {s.current_index + 1} of {s.total}</span>
              <span>{answered} of {data.players.length} answered{left !== null ? ` · ${left}s left` : ""}</span>
            </div>
            <h2 className="text-xl font-semibold">{data.question.prompt}</h2>
            {data.counts ? (
              <ul className="space-y-2">
                {data.question.options.map((o, k) => {
                  const total = Math.max(1, data.counts!.reduce((a, b) => a + b, 0));
                  const right = (data.question!.correct as number[]).includes(k);
                  return (
                    <li key={k} className="relative overflow-hidden rounded-md border border-border px-3 py-2">
                      <div className={`absolute inset-y-0 left-0 opacity-20 ${ANSWER_COLORS[k]}`} style={{ width: `${(100 * data.counts![k]) / total}%` }} />
                      <span className="relative flex justify-between">
                        <span>{o}{right ? " ✓" : ""}</span><span className="font-semibold">{data.counts![k]}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.texts.map((t, i) => <li key={i} className="rounded-md bg-surface px-3 py-1">{t}</li>)}
              </ul>
            )}
            <Button onClick={() => act("next")}>{last ? "Finish game" : "Next question"}</Button>
          </Card>
          <Card><h2 className="mb-3 font-semibold">Leaderboard</h2><Leaderboard players={data.players} /></Card>
        </div>
      )}

      {s.status === "running" && s.pacing === "student" && (
        <Card className="space-y-3">
          <h2 className="text-xl font-semibold">Progress ({data.players.length} students)</h2>
          {data.players.length === 0 && <p className="text-text-muted">Nobody has joined yet.</p>}
          {data.players.map((p) => (
            <div key={p.name} className="flex items-center gap-3">
              <span className="w-40 truncate">{p.name}</span>
              <progress className="flex-1" value={p.answered} max={s.total} aria-label={`${p.name} progress`} />
              <span className="w-24 text-right text-sm">{p.finished ? "Done" : `${p.answered}/${s.total}`} · {p.score}</span>
            </div>
          ))}
        </Card>
      )}

      {(s.status === "ended" || s.closed) && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">{s.status === "ended" ? "Game over" : "Closed (deadline passed)"}</h2>
          <Leaderboard players={data.players} />
          <Link href={`/report/${s.id}`}><Button>See full results</Button></Link>
        </Card>
      )}
    </div>
  );
}
