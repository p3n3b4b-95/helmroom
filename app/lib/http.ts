export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(id: string): string {
  if (!UUID.test(id)) throw new HttpError(404, "Not found");
  return id;
}

// JSON-only bodies: a cross-site form cannot send application/json without a CORS preflight
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Send JSON");
  }
  try {
    const b = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, "Invalid JSON body");
}

type Ctx = { params: Promise<Record<string, string>> };

export function route(fn: (req: Request, params: Record<string, string>) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, await ctx.params);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

const hits = new Map<string, { n: number; reset: number }>();
const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

// ponytail: in-memory per instance, move to a shared store when scaled out
function bump(key: string, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    const fresh = { n: 1, reset: now + windowMs };
    hits.set(key, fresh);
    return fresh;
  }
  h.n++;
  return h;
}

// Count every call.
export function rateLimit(req: Request, key: string, max: number, windowMs = 60_000) {
  if (bump(`${key}:${ipOf(req)}`, windowMs).n > max) throw new HttpError(429, "Too many tries, wait a minute");
}

// Count only failures, so a whole class behind one school IP can join at once.
export function failureGate(req: Request, key: string, max: number, windowMs = 60_000) {
  const h = hits.get(`${key}:${ipOf(req)}`);
  if (h && h.reset >= Date.now() && h.n >= max) throw new HttpError(429, "Too many wrong codes, wait a minute");
  return () => { bump(`${key}:${ipOf(req)}`, windowMs); };
}
