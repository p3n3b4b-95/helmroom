// End-to-end API checks against a running server: BASE=http://localhost:3100 node tests/e2e.mjs
// Wait a minute between runs: wrong-code attempts are throttled per IP.
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3100";
let failed = 0;

function actor() {
  const jar = new Map();
  return async (path, body, method) => {
    const res = await fetch(BASE + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const v = kv.slice(i + 1);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c) || v === "") jar.delete(kv.slice(0, i));
      else jar.set(kv.slice(0, i), v);
    }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}

async function test(name, fn) {
  try { await fn(); console.log("ok   ", name); }
  catch (e) { failed++; console.log("FAIL ", name, "\n     ", e.message.split("\n")[0]); }
}

const uniq = Date.now().toString(36);
const teacher = actor();
const other = actor();
const quiz = {
  title: "Smoke quiz", subject: "test",
  questions: [
    { type: "mcq", prompt: "2+2?", options: ["3", "4", "5"], correct: [1], points: 1000, time_limit_s: 20 },
    { type: "multi", prompt: "Primes?", options: ["2", "3", "4"], correct: [0, 1], points: 1000, time_limit_s: 20 },
    { type: "fill", prompt: "Capital of France?", correct: ["Paris"], points: 500, time_limit_s: 20 },
    { type: "poll", prompt: "Favourite colour?", options: ["red", "blue"], points: 0, time_limit_s: 20 },
    { type: "open", prompt: "Say something", points: 0, time_limit_s: 30 },
  ],
};
let quizId;

await test("signup rejects short password and bad email", async () => {
  assert.equal((await teacher("/api/auth/signup", { email: "a@b.co", password: "short" })).status, 400);
  assert.equal((await teacher("/api/auth/signup", { email: "nope", password: "longenough1" })).status, 400);
});
await test("signup, duplicate email 409, /me works", async () => {
  const email = `t-${uniq}@example.com`;
  assert.equal((await teacher("/api/auth/signup", { email, password: "correct horse", name: "Ms T" })).status, 201);
  assert.equal((await actor()("/api/auth/signup", { email: email.toUpperCase(), password: "correct horse" })).status, 409);
  assert.equal((await teacher("/api/me")).data.user.email, email);
});
await test("login with wrong password 401, right password 200", async () => {
  const a = actor();
  assert.equal((await a("/api/auth/login", { email: `t-${uniq}@example.com`, password: "wrong wrong" })).status, 401);
  assert.equal((await a("/api/auth/login", { email: `t-${uniq}@example.com`, password: "correct horse" })).status, 200);
});
await test("quizzes need login; JSON content type enforced", async () => {
  assert.equal((await actor()("/api/quizzes")).status, 401);
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal(r.status, 415);
});
await test("invalid quizzes are rejected", async () => {
  const bad = { ...quiz, questions: [{ type: "mcq", prompt: "x", options: ["a", "b"], correct: [] }] };
  assert.equal((await teacher("/api/quizzes", bad)).status, 400);
  assert.equal((await teacher("/api/quizzes", { title: "", questions: quiz.questions })).status, 400);
  assert.equal((await teacher("/api/quizzes", { title: "t", questions: [] })).status, 400);
  const img = { title: "t", questions: [{ ...quiz.questions[0], image_url: "javascript:alert(1)" }] };
  assert.equal((await teacher("/api/quizzes", img)).status, 400);
});
await test("create, list, search, fetch, update a quiz", async () => {
  const c = await teacher("/api/quizzes", quiz);
  assert.equal(c.status, 201);
  quizId = c.data.id;
  const list = await teacher("/api/quizzes?q=smoke");
  assert.equal(list.data.quizzes[0].question_count, 5);
  assert.equal((await teacher("/api/quizzes?q=%25")).data.quizzes.length, 0); // % is literal, not a wildcard
  const one = await teacher(`/api/quizzes/${quizId}`);
  assert.equal(one.data.questions[2].correct[0], "Paris");
  assert.equal((await teacher(`/api/quizzes/${quizId}`, { ...quiz, title: "Smoke quiz v2" }, "PUT")).status, 200);
});
await test("another teacher cannot see, change or run my quiz", async () => {
  await other("/api/auth/signup", { email: `o-${uniq}@example.com`, password: "correct horse" });
  assert.equal((await other(`/api/quizzes/${quizId}`)).status, 404);
  assert.equal((await other(`/api/quizzes/${quizId}`, undefined, "DELETE")).status, 404);
  assert.equal((await other(`/api/quizzes/${quizId}/sessions`, { kind: "live" })).status, 404);
});

let sid, code;
const alice = actor(), bob = actor(), late = actor();
await test("live teacher-paced: create session, join, duplicate name refused", async () => {
  const s = await teacher(`/api/quizzes/${quizId}/sessions`, { kind: "live", pacing: "teacher", settings: { allow_change: false } });
  assert.equal(s.status, 201);
  assert.match(s.data.code, /^\d{6}$/);
  sid = s.data.id; code = s.data.code;
  assert.equal((await alice("/api/join", { code, name: "Alice" })).status, 201);
  assert.equal((await bob("/api/join", { code, name: "=HYPERLINK(\"x\")" })).status, 201);
  assert.equal((await late("/api/join", { code, name: "alice" })).status, 409);
  assert.equal((await late("/api/join", { code: "000000", name: "Z" })).status, 404);
  assert.equal((await late("/api/join", { code: "12", name: "Z" })).status, 400);
});
await test("answers are refused before the host starts", async () => {
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 0, answer: 1 })).status, 409);
});
await test("host starts; students never see the right answer", async () => {
  assert.equal((await teacher(`/api/sessions/${sid}/start`, {})).status, 200);
  assert.equal((await teacher(`/api/sessions/${sid}/start`, {})).status, 409);
  const st = await alice(`/api/play/${sid}`);
  assert.equal(st.data.index, 0);
  assert.equal(st.data.question.prompt, "2+2?");
  assert.equal("correct" in st.data.question, false);
  assert.equal(st.data.answered, null);
  assert.ok(st.data.secondsLeft > 0 && st.data.secondsLeft <= 20);
});
await test("scoring: right answer scores once, double submit does not double score, wrong scores 0", async () => {
  const a1 = await alice(`/api/play/${sid}/answer`, { q_index: 0, answer: 1 });
  assert.equal(a1.data.correct, true);
  assert.ok(a1.data.points >= 500 && a1.data.points <= 1000);
  const a2 = await alice(`/api/play/${sid}/answer`, { q_index: 0, answer: 0 });
  assert.equal(a2.data.points, a1.data.points);
  assert.equal(a2.data.correct, true);
  const b1 = await bob(`/api/play/${sid}/answer`, { q_index: 0, answer: 2 });
  assert.equal(b1.data.correct, false);
  assert.equal(b1.data.points, 0);
  const me = await alice(`/api/play/${sid}`);
  assert.equal(me.data.me.score, a1.data.points);
  assert.equal(me.data.answered.correct, true);
});
await test("bad answers and stale question index are refused", async () => {
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 1, answer: [0] })).status, 409);
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 0, answer: "x" })).status, 400); // wrong shape for an mcq
});
await test("host sees answered count and distribution; Next is idempotent", async () => {
  const h = await teacher(`/api/sessions/${sid}`);
  assert.deepEqual(h.data.counts, [0, 1, 1]);
  assert.equal(h.data.players.filter((p) => p.answered_current).length, 2);
  const n1 = await teacher(`/api/sessions/${sid}/next`, { index: 0 });
  const n2 = await teacher(`/api/sessions/${sid}/next`, { index: 0 }); // double click
  assert.equal(n1.status, 200); assert.equal(n2.status, 200);
  assert.equal((await teacher(`/api/sessions/${sid}`)).data.session.current_index, 1);
});
await test("multi and fill grading; a late joiner can still play", async () => {
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 1, answer: [1, 0] })).data.correct, true);
  assert.equal((await bob(`/api/play/${sid}/answer`, { q_index: 1, answer: [0] })).data.correct, false);
  await teacher(`/api/sessions/${sid}/next`, { index: 1 });
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 2, answer: "  paris " })).data.correct, true);
  assert.equal((await late("/api/join", { code, name: "Latecomer" })).status, 201);
  assert.equal((await late(`/api/play/${sid}/answer`, { q_index: 2, answer: "Lyon" })).data.correct, false);
});
await test("poll and open are recorded, not scored; session ends after the last question", async () => {
  await teacher(`/api/sessions/${sid}/next`, { index: 2 });
  const p = await alice(`/api/play/${sid}/answer`, { q_index: 3, answer: 1 });
  assert.equal(p.data.correct, null); assert.equal(p.data.points, 0);
  await teacher(`/api/sessions/${sid}/next`, { index: 3 });
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 4, answer: "<b>hi</b>" })).status, 200);
  await teacher(`/api/sessions/${sid}/next`, { index: 4 });
  assert.equal((await teacher(`/api/sessions/${sid}`)).data.session.status, "ended");
  assert.equal((await alice(`/api/play/${sid}/answer`, { q_index: 4, answer: "x" })).status, 409);
  assert.equal((await late("/api/join", { code, name: "TooLate" })).status, 404);
});
await test("report: per student and per question; CSV is formula-safe", async () => {
  const r = await teacher(`/api/sessions/${sid}/report`);
  assert.equal(r.status, 200);
  assert.equal(r.data.students.length, 3);
  assert.equal(r.data.students[0].name, "Alice");
  assert.equal(r.data.questions[0].correct_pct, 50);
  assert.deepEqual(r.data.questions[0].counts, [0, 1, 1]);
  assert.deepEqual(r.data.questions[4].texts, ["<b>hi</b>"]);
  const csv = await teacher(`/api/sessions/${sid}/report.csv`);
  assert.match(csv.data, /Alice,\d+/);
  assert.match(csv.data, /"'=HYPERLINK\(""x""\)",0/);
  assert.equal((await other(`/api/sessions/${sid}/report`)).status, 404);
});
await test("a stranger without a participant cookie cannot play", async () => {
  assert.equal((await actor()(`/api/play/${sid}`)).status, 401);
});

await test("homework: student-paced, attempts limit, deadline rules", async () => {
  assert.equal((await teacher(`/api/quizzes/${quizId}/sessions`, { kind: "homework", deadline: new Date(Date.now() - 1000).toISOString() })).status, 400);
  const hw = await teacher(`/api/quizzes/${quizId}/sessions`, {
    kind: "homework", attempts: 2, deadline: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.equal(hw.status, 201);
  const s = actor();
  assert.equal((await s("/api/join", { code: hw.data.code, name: "Sam" })).status, 201);
  const play = async (answers) => {
    for (const [i, a] of answers.entries()) {
      const st = await s(`/api/play/${hw.data.id}`);
      assert.equal(st.data.index, i);
      const r = await s(`/api/play/${hw.data.id}/answer`, { q_index: i, answer: a });
      assert.equal(r.status, 200);
    }
  };
  await play([1, [0, 1], "Paris", 0, "ok"]);
  const done = await s(`/api/play/${hw.data.id}`);
  assert.equal(done.data.me.finished, true);
  assert.ok(done.data.me.score >= 1000);
  assert.equal((await s("/api/join", { code: hw.data.code, name: "Sam" })).status, 201); // attempt 2
  assert.equal((await s(`/api/play/${hw.data.id}`)).data.me.score, 0);
  await play([0, [0], "x", 1, "second"]);
  assert.equal((await s("/api/join", { code: hw.data.code, name: "Sam" })).status, 409); // no attempts left
  const a = await teacher("/api/assignments");
  assert.ok(a.data.sessions.some((x) => x.id === hw.data.id && x.players === 1));
  await teacher(`/api/sessions/${hw.data.id}/end`, {});
  assert.equal((await actor()("/api/join", { code: hw.data.code, name: "New" })).status, 404);
});


// ---- teacher rules (settings) ----
const live = async (settings, extra = {}) => {
  const r = await teacher(`/api/quizzes/${quizId}/sessions`, { kind: "live", pacing: "teacher", settings, ...extra });
  assert.equal(r.status, 201);
  return r.data;
};
const pick = (q) =>
  q.prompt === "2+2?" ? q.options.indexOf("4")
  : q.prompt === "Primes?" ? [q.options.indexOf("2"), q.options.indexOf("3")]
  : q.prompt === "Capital of France?" ? "Paris"
  : q.prompt === "Favourite colour?" ? 0 : "fine";

await test("settings are validated", async () => {
  for (const bad of [{ timer: "maybe" }, { extra_time: 5 }, { allow_change: "yes" }, "x"]) {
    const r = await teacher(`/api/quizzes/${quizId}/sessions`, { kind: "live", settings: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});
await test("change your answer: saved without a hint, last answer counts, score hidden until it closes", async () => {
  const g = await live({ timer: "off" });
  const kid = actor();
  await kid("/api/join", { code: g.code, name: "Changer" });
  await teacher(`/api/sessions/${g.id}/start`, {});
  const q = (await kid(`/api/play/${g.id}`)).data.question;
  const right = q.options.indexOf("4"), wrong = q.options.indexOf("3");
  const a1 = await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: wrong });
  assert.deepEqual(a1.data, { saved: true });
  const st = (await kid(`/api/play/${g.id}`)).data;
  assert.equal(st.answered.saved, true);
  assert.equal(st.answered.answer, wrong);
  assert.equal("correct" in st.answered, false);
  const a2 = await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: right });
  assert.deepEqual(a2.data, { saved: true });
  const host = (await teacher(`/api/sessions/${g.id}`)).data;
  assert.equal(host.players[0].score, 1000); // timer off: full points, and the change replaced the wrong answer
  assert.equal((await kid(`/api/play/${g.id}`)).data.me.score, 0); // hidden while it can still change
  await teacher(`/api/sessions/${g.id}/end`, {});
});
await test("answers are final when change is off", async () => {
  const g = await live({ timer: "off", allow_change: false });
  const kid = actor();
  await kid("/api/join", { code: g.code, name: "Final" });
  await teacher(`/api/sessions/${g.id}/start`, {});
  const q = (await kid(`/api/play/${g.id}`)).data.question;
  const first = await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: q.options.indexOf("3") });
  assert.equal(first.data.correct, false);
  const second = await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: q.options.indexOf("4") });
  assert.equal(second.data.correct, false); // the stored answer comes back
  assert.equal((await teacher(`/api/sessions/${g.id}`)).data.players[0].score, 0);
  await teacher(`/api/sessions/${g.id}/end`, {});
});
await test("timer off: no countdown, flat points; extra time stretches the clock", async () => {
  const off = await live({ timer: "off" });
  const kid = actor();
  await kid("/api/join", { code: off.code, name: "Slow" });
  await teacher(`/api/sessions/${off.id}/start`, {});
  const st = (await kid(`/api/play/${off.id}`)).data;
  assert.equal(st.secondsLeft, null);
  assert.equal(st.timerOff, true);
  assert.equal(st.question.time_limit_s, null);
  assert.equal((await teacher(`/api/sessions/${off.id}`)).data.secondsLeft, null);
  await teacher(`/api/sessions/${off.id}/end`, {});

  const x2 = await live({ extra_time: 2 });
  const kid2 = actor();
  await kid2("/api/join", { code: x2.code, name: "Roomy" });
  await teacher(`/api/sessions/${x2.id}/start`, {});
  const st2 = (await kid2(`/api/play/${x2.id}`)).data;
  assert.equal(st2.question.time_limit_s, 40);
  assert.ok(st2.secondsLeft > 30 && st2.secondsLeft <= 40);
  await teacher(`/api/sessions/${x2.id}/end`, {});
});
await test("the verdict appears when the question closes", async () => {
  // a 5 second question, so the wait is short
  const z = await teacher("/api/quizzes", { title: "Quick", questions: [{ type: "mcq", prompt: "1+1?", options: ["2", "3"], correct: [0], time_limit_s: 5 }] });
  const g = (await teacher(`/api/quizzes/${z.data.id}/sessions`, { kind: "live" })).data;
  const kid = actor();
  await kid("/api/join", { code: g.code, name: "Waiter" });
  await teacher(`/api/sessions/${g.id}/start`, {});
  await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: 0 });
  assert.equal((await kid(`/api/play/${g.id}`)).data.answered.saved, true);
  await new Promise((r) => setTimeout(r, 6200));
  const after = (await kid(`/api/play/${g.id}`)).data;
  assert.equal(after.answered.saved, false);
  assert.equal(after.answered.correct, true);
  assert.equal(after.me.score, after.answered.points);
  assert.equal((await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: 1 })).data.correct, true); // too late to change
  await teacher(`/api/sessions/${g.id}/end`, {});
});
await test("hide right answer and hide leaderboard from students", async () => {
  const g = await live({ timer: "off", allow_change: false, show_correct: false, show_leaderboard: false });
  const kid = actor();
  await kid("/api/join", { code: g.code, name: "Blind" });
  await teacher(`/api/sessions/${g.id}/start`, {});
  const q = (await kid(`/api/play/${g.id}`)).data.question;
  const r = await kid(`/api/play/${g.id}/answer`, { q_index: 0, answer: q.options.indexOf("3") });
  assert.equal(r.data.correct, false);
  assert.equal(r.data.correctAnswer, null);
  const st = (await kid(`/api/play/${g.id}`)).data;
  assert.equal(st.answered.correctAnswer, null);
  assert.deepEqual(st.leaderboard, []);
  assert.equal(st.me.rank, null);
  const host = (await teacher(`/api/sessions/${g.id}`)).data; // the teacher still sees everything
  assert.equal(host.players.length, 1);
  await teacher(`/api/sessions/${g.id}/end`, {});
});
await test("shuffled answers and questions still grade and report correctly", async () => {
  const hw = (await teacher(`/api/quizzes/${quizId}/sessions`, {
    kind: "homework", deadline: new Date(Date.now() + 3600_000).toISOString(),
    settings: { shuffle_answers: true, shuffle_questions: true },
  })).data;
  const orders = new Set(), optionOrders = new Set();
  for (let k = 0; k < 6; k++) {
    const kid = actor();
    assert.equal((await kid("/api/join", { code: hw.code, name: `Shuf ${k}` })).status, 201);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      const st = (await kid(`/api/play/${hw.id}`)).data;
      assert.equal(st.index, i);
      seen.push(st.question.prompt);
      if (st.question.prompt === "2+2?") optionOrders.add(st.question.options.join(","));
      const r = await kid(`/api/play/${hw.id}/answer`, { q_index: i, answer: pick(st.question) });
      assert.equal(r.status, 200);
      if (["2+2?", "Primes?", "Capital of France?"].includes(st.question.prompt)) assert.equal(r.data.correct, true, st.question.prompt);
    }
    assert.deepEqual([...seen].sort(), ["2+2?", "Capital of France?", "Favourite colour?", "Primes?", "Say something"]);
    orders.add(seen.join("|"));
  }
  assert.ok(orders.size > 1, "questions came in more than one order");
  assert.ok(optionOrders.size > 1, "answers came in more than one order");
  const rep = (await teacher(`/api/sessions/${hw.id}/report`)).data;
  assert.equal(rep.students.length, 6);
  assert.ok(rep.students.every((x) => x.answered === 5));
  assert.equal(rep.questions[0].prompt, "2+2?"); // the report keeps the quiz's own order
  assert.equal(rep.questions[0].correct_pct, 100);
  assert.deepEqual(rep.questions[0].counts, [0, 6, 0]); // counted against the real options
  await teacher(`/api/sessions/${hw.id}/end`, {});
});
await test("rename and duplicate a quiz", async () => {
  assert.equal((await teacher(`/api/quizzes/${quizId}`, { title: "  " }, "PATCH")).status, 400);
  const r = await teacher(`/api/quizzes/${quizId}`, { title: "Renamed quiz" }, "PATCH");
  assert.equal(r.data.title, "Renamed quiz");
  const d = await teacher(`/api/quizzes/${quizId}/duplicate`, {});
  assert.equal(d.status, 201);
  assert.equal(d.data.title, "Copy of Renamed quiz");
  const copy = (await teacher(`/api/quizzes/${d.data.id}`)).data;
  assert.equal(copy.questions.length, 5);
  assert.equal(copy.questions[2].correct[0], "Paris");
  assert.equal((await other(`/api/quizzes/${quizId}`, { title: "mine now" }, "PATCH")).status, 404);
  assert.equal((await other(`/api/quizzes/${quizId}/duplicate`, {})).status, 404);
});

await test("a whole class behind one IP can join; wrong codes get throttled", async () => {
  const s = await teacher(`/api/quizzes/${quizId}/sessions`, { kind: "live" });
  assert.equal(s.status, 201);
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) => actor()("/api/join", { code: s.data.code, name: `Kid ${i}` })));
  assert.equal(res.filter((r) => r.status === 201).length, 40);
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await actor()("/api/join", { code: "999999", name: "x" })).status;
  assert.equal(last, 429);
  await teacher(`/api/sessions/${s.data.id}/end`, {});
});

await test("logout clears the session", async () => {
  assert.equal((await teacher("/api/auth/logout", {})).status, 200);
  assert.equal((await teacher("/api/quizzes")).status, 401);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
