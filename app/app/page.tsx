"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

const CONTROLS = [
  ["Time per question", "Give each question anywhere from 5 seconds to 5 minutes. Then stretch it for the whole game, or turn the timer off."],
  ["Change your answer", "Students can fix a misclick until the question ends. Turn it off for a test."],
  ["Shuffle, or don't", "Shuffle the questions, the answers, both, or neither."],
  ["Show only what you want", "Choose whether students see the right answer, and whether they see the leaderboard."],
  ["Your pace or theirs", "Move the whole class on yourself, or let every student go at their own speed."],
  ["Homework with a due date", "Set a deadline and how many attempts students get, up to 10. The code stays open until it closes."],
  ["Edit any time", "Rename, duplicate or reorder a quiz after you've used it. A game already running keeps the version it started with."],
];

const BASICS = [
  ["Five question types", "Multiple choice, multiple answers, poll, fill in the blank and open-ended."],
  ["Live leaderboard", "Points for right answers, a little more for quick ones."],
  ["Results you can use", "Per student and per question, with a CSV download."],
  ["No accounts for students", "They enter a code and a name. That's all we ask."],
];

const FAQ = [
  ["Is it free?", "Yes. Helmroom is free while it's in beta, with every feature on. We'll tell you well before that changes."],
  ["Do students need an account?", "No. They enter the game code and a name. We store the name, their answers and their score for that game, nothing else."],
  ["Can I bring in quizzes from other tools?", "Not yet. There's no importer, so for now you'd write them here."],
  ["Does it work on phones?", "Students can play on a phone browser. We haven't built a store app, and the quiz editor works best on a computer."],
  ["Who can see my quizzes?", "Only you. Quizzes aren't shared or listed anywhere."],
];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sessionId: string }>("/api/join", { body: { code, name } });
      router.push(`/play/${r.sessionId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-20">
      <section className="mx-auto grid max-w-4xl gap-10 py-8 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-[40px] font-bold leading-[44px]">Run the quiz your way</h1>
          <p className="mt-4 text-text-muted">
            Write a quiz, set the rules, then run it live or send it home. Students join with a code. No accounts.
          </p>
          <p className="mt-6">
            <Link href="/signup" className="inline-flex h-12 items-center rounded-md bg-accent px-6 font-semibold text-on-accent">
              Make a free teacher account
            </Link>
          </p>
        </div>
        <Card>
          <form onSubmit={join} className="space-y-4">
            <h2 className="text-xl font-semibold">Joining a game?</h2>
            <Field label="Game code">
              <Input inputMode="numeric" autoComplete="off" maxLength={7} placeholder="6 digits" value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} required />
            </Field>
            <Field label="Your name">
              <Input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Joining…" : "Join"}</Button>
          </form>
        </Card>
      </section>

      <section className="mx-auto max-w-3xl space-y-3">
        <h2 className="text-[28px] font-bold leading-[34px]">You shouldn't have to hunt for the setting</h2>
        <p className="text-text-muted">
          Renaming a quiz, moving a question, giving a long question more time. These are small jobs, and they
          shouldn't turn into a search through menus. In Helmroom the rules for a game sit in one panel, in plain words,
          before you start.
        </p>
      </section>

      <section className="mx-auto max-w-4xl space-y-6">
        <h2 className="text-[28px] font-bold leading-[34px]">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            ["1. Write it", "Add questions, mark the right answers, set the time each one gets."],
            ["2. Set the rules", "Live with you in charge, live at each student's pace, or homework with a due date."],
            ["3. Share the code", "Students join in seconds. Watch answers come in, then read the results."],
          ].map(([t, d]) => (
            <li key={t}><Card className="h-full"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-text-muted">{d}</p></Card></li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-4xl space-y-6">
        <h2 className="text-[28px] font-bold leading-[34px]">You set the rules</h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {CONTROLS.map(([t, d]) => (
            <li key={t}><Card className="h-full"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-text-muted">{d}</p></Card></li>
          ))}
        </ul>
        <h2 className="pt-4 text-xl font-semibold">And the basics are here</h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {BASICS.map(([t, d]) => (
            <li key={t}><Card className="h-full"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-text-muted">{d}</p></Card></li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl">
        <Card className="space-y-2 bg-surface">
          <h2 className="text-[28px] font-bold leading-[34px]">Free while in beta</h2>
          <p className="text-text-muted">Every feature, no card, no limit we'd make you hit. If that changes, you'll hear about it first.</p>
        </Card>
      </section>

      <section className="mx-auto max-w-3xl space-y-4">
        <h2 className="text-[28px] font-bold leading-[34px]">Questions</h2>
        <dl className="space-y-4">
          {FAQ.map(([q, a]) => (
            <div key={q}><dt className="font-semibold">{q}</dt><dd className="text-text-muted">{a}</dd></div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-3xl pb-8 text-center">
        <h2 className="text-[28px] font-bold leading-[34px]">Write your first quiz</h2>
        <p className="mt-2 text-text-muted">It takes a few minutes.</p>
        <p className="mt-4">
          <Link href="/signup" className="inline-flex h-12 items-center rounded-md bg-accent px-6 font-semibold text-on-accent">
            Make a free teacher account
          </Link>
        </p>
      </section>
    </div>
  );
}
