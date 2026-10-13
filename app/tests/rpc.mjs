// Checks the database layer the way the app uses it: sign in, then call the functions over HTTP.
//   node scripts/local-supabase.mjs        (in another terminal)
//   SUPABASE_URL=http://localhost:54321 node tests/rpc.mjs
// Against a real project, set SUPABASE_URL and SUPABASE_ANON_KEY to a throwaway project.
import assert from "node:assert/strict";

const URL_ = process.env.SUPABASE_URL ?? "http://localhost:54321";
const KEY = process.env.SUPABASE_ANON_KEY ?? "local";
let failed = 0;

function actor() {
  let token = null;
  const self = {
    id: null, email: null,
    async auth(path, body) {
      const r = await fetch(`${URL_}/auth/v1/${path}`, { method: "POST", headers: { "content-type": "application/json", apikey: KEY }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.access_token) { token = d.access_token; self.id = d.user.id; }
      return { status: r.status, data: d };
    },
    signup: (email, password) => { self.email = email; return self.auth("signup", { email, password }); },
    login: (email, password) => self.auth("token?grant_type=password", { email, password }),
    anon: () => self.auth("signup", {}),
    async rpc(fn, args = {}) {
      const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
        method: "POST", headers: { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${token ?? KEY}` }, body: JSON.stringify(args),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data, msg: data?.message };
    },
  };
  return self;
}
const ok = (r, label = "") => { assert.equal(r.status, 200, `${label} ${r.msg ?? JSON.stringify(r.data)}`); return r.data; };
const bad = (r, re) => { assert.equal(r.status, 400, JSON.stringify(r.data)); if (re) assert.match(r.msg, re); };

async function test(name, fn) {
  try { await fn(); console.log("ok   ", name); }
  catch (e) { failed++; console.log("FAIL ", name, "\n     ", e.message.split("\n")[0]); }
}

const uniq = Date.now().toString(36);
const mail = (t) => `${t}-${uniq}@example.com`;
const PW = "correct horse";
const teacher = actor(), other = actor();
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

const kid = async (name, code) => {
  const k = actor();
  ok(await k.anon(), "anon");
  if (code) assert.ok(ok(await k.rpc("game_join", { p_code: code, p_name: name })).sessionId, `${name} joins`);
  return k;
};
const live = async (settings, extra = {}) =>
  ok(await teacher.rpc("session_create", { p_quiz: quizId, p_opts: { kind: "live", pacing: "teacher", settings, ...extra } }));
const act = async (id, a, i) => ok(await teacher.rpc("session_action", { p_id: id, p_action: a, p_index: i ?? null }));
const pick = (q) =>
  q.prompt === "2+2?" ? q.options.indexOf("4")
  : q.prompt === "Primes?" ? [q.options.indexOf("2"), q.options.indexOf("3")]
  : q.prompt === "Capital of France?" ? "Paris"
  : q.prompt === "Favourite colour?" ? 0 : "fine";

await test("sign up, duplicate email, wrong password, right password", async () => {
  ok(await teacher.signup(mail("t"), PW), "signup");
  assert.equal((await actor().signup(mail("t").toUpperCase(), PW)).status, 422);
  assert.equal((await actor().login(mail("t"), "wrong wrong")).status, 400);
  assert.equal((await actor().login(mail("t"), PW)).status, 200);
});
await test("quiz functions need a teacher: no token and anonymous students are refused", async () => {
  const none = actor();
  assert.ok([401, 403].includes((await none.rpc("quiz_list")).status));
  const kid1 = actor(); await kid1.anon();
  bad(await kid1.rpc("quiz_list"), /teacher account/);
});
await test("tables cannot be read or written directly", async () => {
  const r = await fetch(`${URL_}/rest/v1/quizzes?select=*`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  assert.ok(r.status >= 400 || (await r.json()).length === 0); // refused, or an empty list under row level security
});
await test("invalid quizzes are rejected with a reason", async () => {
  const q = (qs, title = "t") => teacher.rpc("quiz_save", { p_id: null, p_quiz: { title, questions: qs } });
  bad(await q([{ type: "mcq", prompt: "x", options: ["a", "b"], correct: [] }]), /exactly one correct/);
  bad(await q([{ type: "mcq", prompt: "x", options: ["a", ""], correct: [0] }]), /2 to 6 answers/);
  bad(await q([{ type: "nope", prompt: "x" }]), /unknown type/);
  bad(await q([], "t"), /at least one question/);
  bad(await q(quiz.questions, ""), /title/);
  bad(await q([{ type: "mcq", prompt: "x", options: ["a", "b"], correct: [0], image_url: "javascript:alert(1)" }]), /https/);
  bad(await q([{ type: "fill", prompt: "x", correct: [] }]), /accepted answer/);
});
await test("create, list, search, get and replace a quiz", async () => {
  quizId = ok(await teacher.rpc("quiz_save", { p_id: null, p_quiz: quiz }));
  const list = ok(await teacher.rpc("quiz_list", { p_q: "smoke" }));
  assert.equal(list[0].question_count, 5);
  assert.equal(ok(await teacher.rpc("quiz_list", { p_q: "%" })).length, 0); // % is literal, not a wildcard
  const one = ok(await teacher.rpc("quiz_get", { p_id: quizId }));
  assert.equal(one.questions[2].correct[0], "Paris");
  assert.equal(one.questions[0].points, 1000);
  ok(await teacher.rpc("quiz_save", { p_id: quizId, p_quiz: { ...quiz, title: "Smoke quiz v2" } }));
  assert.equal(ok(await teacher.rpc("quiz_get", { p_id: quizId })).title, "Smoke quiz v2");
});
await test("another teacher cannot see, change, run or delete my quiz", async () => {
  ok(await other.signup(mail("o"), PW));
  bad(await other.rpc("quiz_get", { p_id: quizId }), /not found/);
  bad(await other.rpc("quiz_delete", { p_id: quizId }), /not found/);
  bad(await other.rpc("quiz_rename", { p_id: quizId, p_title: "mine" }), /not found/);
  bad(await other.rpc("quiz_duplicate", { p_id: quizId }), /not found/);
  bad(await other.rpc("session_create", { p_quiz: quizId, p_opts: { kind: "live" } }), /not found/);
});

let sid, code, alice, bob, late;
await test("live game: create, join, a taken name is refused", async () => {
  const g = await live({ allow_change: false });
  assert.match(g.code, /^\d{6}$/);
  sid = g.id; code = g.code;
  alice = await kid("Alice", code);
  bob = await kid('=HYPERLINK("x")', code);
  late = actor(); await late.anon();
  bad(await late.rpc("game_join", { p_code: code, p_name: "alice" }), /name is taken/);
  assert.match(ok(await late.rpc("game_join", { p_code: "000000", p_name: "Z" })).error, /No open game/);
  assert.match(ok(await late.rpc("game_join", { p_code: "12", p_name: "Z" })).error, /6 digits/);
});
await test("answers are refused before the host starts", async () => {
  bad(await alice.rpc("game_answer", { p_session: sid, p_index: 0, p_answer: 1 }), /not accepting answers/);
});
await test("host starts; students never see the right answer", async () => {
  await act(sid, "start");
  bad(await teacher.rpc("session_action", { p_id: sid, p_action: "start" }), /Already started/);
  const st = ok(await alice.rpc("game_state", { p_session: sid }));
  assert.equal(st.index, 0);
  assert.equal(st.question.prompt, "2+2?");
  assert.equal("correct" in st.question, false);
  assert.equal(st.answered, null);
  assert.ok(st.secondsLeft > 0 && st.secondsLeft <= 20);
});
await test("scoring: a right answer scores once, a second try changes nothing, wrong scores 0", async () => {
  const a1 = ok(await alice.rpc("game_answer", { p_session: sid, p_index: 0, p_answer: 1 }));
  assert.equal(a1.correct, true);
  assert.ok(a1.points >= 500 && a1.points <= 1000);
  const a2 = ok(await alice.rpc("game_answer", { p_session: sid, p_index: 0, p_answer: 0 }));
  assert.equal(a2.points, a1.points);
  assert.equal(a2.correct, true);
  const b1 = ok(await bob.rpc("game_answer", { p_session: sid, p_index: 0, p_answer: 2 }));
  assert.equal(b1.correct, false); assert.equal(b1.points, 0);
  const me = ok(await alice.rpc("game_state", { p_session: sid }));
  assert.equal(me.me.score, a1.points);
  assert.equal(me.answered.correct, true);
});
await test("bad answers and a stale question index are refused", async () => {
  bad(await alice.rpc("game_answer", { p_session: sid, p_index: 1, p_answer: [0] }), /not open/);
  bad(await alice.rpc("game_answer", { p_session: sid, p_index: 0, p_answer: "x" }), /Invalid answer/);
});
await test("host sees counts and who answered; Next is idempotent", async () => {
  const h = ok(await teacher.rpc("session_host_state", { p_id: sid }));
  assert.deepEqual(h.counts, [0, 1, 1]);
  assert.equal(h.players.filter((p) => p.answered_current).length, 2);
  await act(sid, "next", 0);
  await act(sid, "next", 0); // a double click
  assert.equal(ok(await teacher.rpc("session_host_state", { p_id: sid })).session.current_index, 1);
});
await test("multi and fill are graded; a late joiner can still play", async () => {
  assert.equal(ok(await alice.rpc("game_answer", { p_session: sid, p_index: 1, p_answer: [1, 0] })).correct, true);
  assert.equal(ok(await bob.rpc("game_answer", { p_session: sid, p_index: 1, p_answer: [0] })).correct, false);
  await act(sid, "next", 1);
  assert.equal(ok(await alice.rpc("game_answer", { p_session: sid, p_index: 2, p_answer: "  paris " })).correct, true);
  const l = await kid("Latecomer", code);
  assert.equal(ok(await l.rpc("game_answer", { p_session: sid, p_index: 2, p_answer: "Lyon" })).correct, false);
});
await test("poll and open are recorded, not scored; the game ends after the last question", async () => {
  await act(sid, "next", 2);
  const p = ok(await alice.rpc("game_answer", { p_session: sid, p_index: 3, p_answer: 1 }));
  assert.equal(p.correct, null); assert.equal(p.points, 0);
  await act(sid, "next", 3);
  ok(await alice.rpc("game_answer", { p_session: sid, p_index: 4, p_answer: "<b>hi</b>" }));
  await act(sid, "next", 4);
  assert.equal(ok(await teacher.rpc("session_host_state", { p_id: sid })).session.status, "ended");
  bad(await alice.rpc("game_answer", { p_session: sid, p_index: 4, p_answer: "x" }), /not accepting/);
  const t = actor(); await t.anon();
  assert.match(ok(await t.rpc("game_join", { p_code: code, p_name: "TooLate" })).error, /No open game/);
});
await test("report: per student and per question, only for the host", async () => {
  const r = ok(await teacher.rpc("session_report", { p_id: sid }));
  assert.equal(r.students.length, 3);
  assert.equal(r.students[0].name, "Alice");
  assert.equal(r.questions[0].correct_pct, 50);
  assert.deepEqual(r.questions[0].counts, [0, 1, 1]);
  assert.deepEqual(r.questions[4].texts, ["<b>hi</b>"]);
  bad(await other.rpc("session_report", { p_id: sid }), /not found/);
});
await test("a stranger who never joined cannot read or answer a game", async () => {
  const s = actor(); await s.anon();
  bad(await s.rpc("game_state", { p_session: sid }), /Join the game/);
  bad(await s.rpc("game_answer", { p_session: sid, p_index: 0, p_answer: 0 }), /Join the game/);
});

await test("homework: self-paced, same person gets attempt 2, then no more; deadline rules", async () => {
  bad(await teacher.rpc("session_create", { p_quiz: quizId, p_opts: { kind: "homework", deadline: new Date(Date.now() - 1000).toISOString() } }), /future/);
  const hw = ok(await teacher.rpc("session_create", { p_quiz: quizId, p_opts: { kind: "homework", attempts: 2, deadline: new Date(Date.now() + 3600_000).toISOString() } }));
  const s = await kid("Sam", hw.code);
  const play = async (answers) => {
    for (const [i, a] of answers.entries()) {
      const st = ok(await s.rpc("game_state", { p_session: hw.id }));
      assert.equal(st.index, i);
      ok(await s.rpc("game_answer", { p_session: hw.id, p_index: i, p_answer: a }));
    }
  };
  await play([1, [0, 1], "Paris", 0, "ok"]);
  const done = ok(await s.rpc("game_state", { p_session: hw.id }));
  assert.equal(done.me.finished, true);
  assert.ok(done.me.score >= 1000);
  ok(await s.rpc("game_join", { p_code: hw.code, p_name: "Sam" })); // attempt 2
  assert.equal(ok(await s.rpc("game_state", { p_session: hw.id })).me.score, 0);
  await play([0, [0], "x", 1, "second"]);
  const again = ok(await s.rpc("game_join", { p_code: hw.code, p_name: "Sam" })); // no attempts left: resumes the finished one
  assert.equal(ok(await s.rpc("game_state", { p_session: hw.id })).me.attempt, 2);
  assert.ok(again.sessionId);
  const other2 = actor(); await other2.anon();
  bad(await other2.rpc("game_join", { p_code: hw.code, p_name: "sam" }), /name is taken/);
  assert.ok(ok(await teacher.rpc("session_list")).some((x) => x.id === hw.id && x.players === 1));
  await act(hw.id, "end");
  const n = actor(); await n.anon();
  assert.match(ok(await n.rpc("game_join", { p_code: hw.code, p_name: "New" })).error, /No open game/);
});

await test("rules are validated", async () => {
  for (const bad_ of [{ timer: "maybe" }, { extra_time: 5 }, { allow_change: "yes" }, "x"]) {
    bad(await teacher.rpc("session_create", { p_quiz: quizId, p_opts: { kind: "live", settings: bad_ } }), undefined);
  }
});
await test("change your answer: saved with no hint, the last answer counts, score held back", async () => {
  const g = await live({ timer: "off" });
  const k = await kid("Changer", g.code);
  await act(g.id, "start");
  const q = ok(await k.rpc("game_state", { p_session: g.id })).question;
  const right = q.options.indexOf("4"), wrong = q.options.indexOf("3");
  assert.deepEqual(ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: wrong })), { saved: true });
  const st = ok(await k.rpc("game_state", { p_session: g.id }));
  assert.equal(st.answered.saved, true);
  assert.equal(st.answered.answer, wrong);
  assert.equal("correct" in st.answered, false);
  assert.deepEqual(ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: right })), { saved: true });
  assert.equal(ok(await teacher.rpc("session_host_state", { p_id: g.id })).players[0].score, 1000);
  assert.equal(ok(await k.rpc("game_state", { p_session: g.id })).me.score, 0);
  await act(g.id, "end");
});
await test("answers are final when change is off", async () => {
  const g = await live({ timer: "off", allow_change: false });
  const k = await kid("Final", g.code);
  await act(g.id, "start");
  const q = ok(await k.rpc("game_state", { p_session: g.id })).question;
  assert.equal(ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: q.options.indexOf("3") })).correct, false);
  assert.equal(ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: q.options.indexOf("4") })).correct, false);
  assert.equal(ok(await teacher.rpc("session_host_state", { p_id: g.id })).players[0].score, 0);
  await act(g.id, "end");
});
await test("timer off: no countdown and flat points; extra time stretches the clock", async () => {
  const off = await live({ timer: "off" });
  const k = await kid("Slow", off.code);
  await act(off.id, "start");
  const st = ok(await k.rpc("game_state", { p_session: off.id }));
  assert.equal(st.secondsLeft, null); assert.equal(st.timerOff, true); assert.equal(st.question.time_limit_s, null);
  assert.equal(ok(await teacher.rpc("session_host_state", { p_id: off.id })).secondsLeft, null);
  await act(off.id, "end");
  const x2 = await live({ extra_time: 2 });
  const k2 = await kid("Roomy", x2.code);
  await act(x2.id, "start");
  const s2 = ok(await k2.rpc("game_state", { p_session: x2.id }));
  assert.equal(s2.question.time_limit_s, 40);
  assert.ok(s2.secondsLeft > 30 && s2.secondsLeft <= 40);
  await act(x2.id, "end");
});
await test("the verdict appears when the question closes, and a change is too late by then", async () => {
  const z = ok(await teacher.rpc("quiz_save", { p_id: null, p_quiz: { title: "Quick", questions: [{ type: "mcq", prompt: "1+1?", options: ["2", "3"], correct: [0], time_limit_s: 5 }] } }));
  const g = ok(await teacher.rpc("session_create", { p_quiz: z, p_opts: { kind: "live" } }));
  const k = await kid("Waiter", g.code);
  await act(g.id, "start");
  ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: 0 }));
  assert.equal(ok(await k.rpc("game_state", { p_session: g.id })).answered.saved, true);
  await new Promise((r) => setTimeout(r, 6200));
  const after = ok(await k.rpc("game_state", { p_session: g.id }));
  assert.equal(after.answered.saved, false);
  assert.equal(after.answered.correct, true);
  assert.equal(after.me.score, after.answered.points);
  assert.equal(ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: 1 })).correct, true);
  await act(g.id, "end");
});
await test("hide the right answer and the leaderboard from students; the teacher still sees both", async () => {
  const g = await live({ timer: "off", allow_change: false, show_correct: false, show_leaderboard: false });
  const k = await kid("Blind", g.code);
  await act(g.id, "start");
  const q = ok(await k.rpc("game_state", { p_session: g.id })).question;
  const r = ok(await k.rpc("game_answer", { p_session: g.id, p_index: 0, p_answer: q.options.indexOf("3") }));
  assert.equal(r.correct, false); assert.equal(r.correctAnswer, null);
  const st = ok(await k.rpc("game_state", { p_session: g.id }));
  assert.equal(st.answered.correctAnswer, null);
  assert.deepEqual(st.leaderboard, []);
  assert.equal(st.me.rank, null);
  assert.equal(ok(await teacher.rpc("session_host_state", { p_id: g.id })).players.length, 1);
  await act(g.id, "end");
});
await test("shuffled answers and questions still grade and report correctly", async () => {
  const hw = ok(await teacher.rpc("session_create", { p_quiz: quizId, p_opts: {
    kind: "homework", deadline: new Date(Date.now() + 3600_000).toISOString(), settings: { shuffle_answers: true, shuffle_questions: true } } }));
  const orders = new Set(), optionOrders = new Set();
  for (let k = 0; k < 6; k++) {
    const kd = await kid(`Shuf ${k}`, hw.code);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      const st = ok(await kd.rpc("game_state", { p_session: hw.id }));
      assert.equal(st.index, i);
      seen.push(st.question.prompt);
      if (st.question.prompt === "2+2?") optionOrders.add(st.question.options.join(","));
      const r = ok(await kd.rpc("game_answer", { p_session: hw.id, p_index: i, p_answer: pick(st.question) }));
      if (["2+2?", "Primes?", "Capital of France?"].includes(st.question.prompt)) assert.equal(r.correct, true, st.question.prompt);
    }
    assert.deepEqual([...seen].sort(), ["2+2?", "Capital of France?", "Favourite colour?", "Primes?", "Say something"]);
    orders.add(seen.join("|"));
  }
  assert.ok(orders.size > 1, "questions came in more than one order");
  assert.ok(optionOrders.size > 1, "answers came in more than one order");
  const rep = ok(await teacher.rpc("session_report", { p_id: hw.id }));
  assert.equal(rep.students.length, 6);
  assert.ok(rep.students.every((x) => x.answered === 5));
  assert.equal(rep.questions[0].prompt, "2+2?");
  assert.equal(rep.questions[0].correct_pct, 100);
  assert.deepEqual(rep.questions[0].counts, [0, 6, 0]);
  await act(hw.id, "end");
});
await test("shuffled teacher-paced games share one order across the class", async () => {
  const g = await live({ shuffle_questions: true, timer: "off" });
  const a = await kid("A", g.code), b = await kid("B", g.code);
  await act(g.id, "start");
  const pa = ok(await a.rpc("game_state", { p_session: g.id })).question.prompt;
  const pb = ok(await b.rpc("game_state", { p_session: g.id })).question.prompt;
  assert.equal(pa, pb);
  await act(g.id, "end");
});
await test("rename and duplicate a quiz", async () => {
  bad(await teacher.rpc("quiz_rename", { p_id: quizId, p_title: "  " }), /title/);
  assert.equal(ok(await teacher.rpc("quiz_rename", { p_id: quizId, p_title: "Renamed quiz" })).title, "Renamed quiz");
  const d = ok(await teacher.rpc("quiz_duplicate", { p_id: quizId }));
  assert.equal(d.title, "Copy of Renamed quiz");
  const copy = ok(await teacher.rpc("quiz_get", { p_id: d.id }));
  assert.equal(copy.questions.length, 5);
  assert.equal(copy.questions[2].correct[0], "Paris");
});
await test("account deletion removes the account and everything under it", async () => {
  const t = actor(); const email = mail("del");
  ok(await t.signup(email, PW));
  const z = ok(await t.rpc("quiz_save", { p_id: null, p_quiz: { title: "Doomed", questions: [{ type: "mcq", prompt: "a", options: ["1", "2"], correct: [0] }] } }));
  const g = ok(await t.rpc("session_create", { p_quiz: z, p_opts: { kind: "live" } }));
  const k = await kid("Gone", g.code);
  bad(await t.rpc("account_delete", { p_confirm: "wrong@example.com" }), /confirm/);
  ok(await t.rpc("account_delete", { p_confirm: email.toUpperCase() }));
  assert.equal((await actor().login(email, PW)).status, 400);
  bad(await k.rpc("game_state", { p_session: g.id }), /Join the game/);
});
await test("a whole class can join at once; wrong codes get throttled per person", async () => {
  const g = await live({});
  const res = await Promise.all(Array.from({ length: 40 }, async (_, i) => {
    const k = actor(); await k.anon();
    return k.rpc("game_join", { p_code: g.code, p_name: `Kid ${i}` });
  }));
  assert.equal(res.filter((r) => r.status === 200 && r.data.sessionId).length, 40);
  const k = actor(); await k.anon();
  let last;
  for (let i = 0; i < 12; i++) last = ok(await k.rpc("game_join", { p_code: "999999", p_name: "x" }));
  assert.match(last.error, /Too many wrong codes/);
  await act(g.id, "end");
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
