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
// ponytail: in-memory per instance, move to a shared store when scaled out
export function rateLimit(req: Request, key: string, max: number, windowMs = 60_000) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const h = hits.get(k);
  if (!h || h.reset < now) {
    hits.set(k, { n: 1, reset: now + windowMs });
    return;
  }
  if (++h.n > max) throw new HttpError(429, "Too many tries, wait a minute");
}
