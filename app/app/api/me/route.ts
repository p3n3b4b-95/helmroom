import { getTeacher } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => Response.json({ user: await getTeacher() }));
