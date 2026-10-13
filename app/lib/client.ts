"use client";
import { useEffect, useRef, useState } from "react";

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { status: res.status });
  return data as T;
}

// Poll an endpoint every `ms`. Keeps the last good value if one poll fails.
export function usePoll<T>(path: string | null, ms = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<(Error & { status?: number }) | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!path) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await api<T>(path);
        if (alive.current) { setData(d); setError(null); }
      } catch (e) {
        if (alive.current) setError(e as Error);
      }
      if (alive.current) timer = setTimeout(tick, ms);
    };
    tick();
    return () => { alive.current = false; clearTimeout(timer); };
  }, [path, ms]);
  return { data, error, refresh: async () => { if (path) try { setData(await api<T>(path)); } catch {} } };
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
