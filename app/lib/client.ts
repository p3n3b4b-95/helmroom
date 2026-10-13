"use client";
import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public by design: the anon key only lets someone call the functions, and the functions check who is asking.
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(URL_ && KEY);

// Teachers and students keep separate sessions, so a teacher trying the student view doesn't sign themselves out.
function make(storageKey: string, detectSessionInUrl: boolean) {
  return createClient(URL_ ?? "http://not-configured.invalid", KEY ?? "not-configured", {
    auth: { storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl },
  });
}
let teacherC: SupabaseClient | undefined;
let studentC: SupabaseClient | undefined;
export const teacherClient = () => (teacherC ??= make("helmroom-teacher", true));
export const studentClient = () => (studentC ??= make("helmroom-student", false));

export type ApiError = Error & { status?: number };

export async function rpc<T = unknown>(c: SupabaseClient, fn: string, args: object = {}): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) {
    const needsLogin = /log in|permission denied|JWT|join the game first/i.test(error.message) || error.code === "42501";
    throw Object.assign(new Error(error.message), { status: needsLogin ? 401 : 400 });
  }
  return data as T;
}

export async function ensureStudent() {
  const c = studentClient();
  const { data } = await c.auth.getSession();
  if (!data.session) {
    const { error } = await c.auth.signInAnonymously();
    if (error) throw new Error(error.message);
  }
  return c;
}

// Call `fn` every `ms`. Keeps the last good value if one call fails.
export function usePoll<T>(key: string | null, fn: () => Promise<T>, ms = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const alive = useRef(true);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    alive.current = true;
    if (!key) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await latest.current();
        if (alive.current) { setData(d); setError(null); }
      } catch (e) {
        if (alive.current) setError(e as ApiError);
      }
      if (alive.current) timer = setTimeout(tick, ms);
    };
    tick();
    return () => { alive.current = false; clearTimeout(timer); };
  }, [key, ms]);
  return { data, error, refresh: async () => { if (key) try { setData(await latest.current()); } catch {} } };
}

// seconds left, ticking locally between polls
export function useCountdown(secondsLeft: number | null | undefined, key: unknown) {
  const [now, setNow] = useState(() => Date.now());
  const base = useRef({ at: Date.now(), s: secondsLeft ?? null });
  useEffect(() => { base.current = { at: Date.now(), s: secondsLeft ?? null }; }, [secondsLeft, key]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (base.current.s === null) return null;
  return Math.max(0, Math.ceil(base.current.s - (now - base.current.at) / 1000));
}

// one cell of a CSV; student names are untrusted, so nothing may start like a spreadsheet formula
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
