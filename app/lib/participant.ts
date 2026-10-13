import { cookies } from "next/headers";
import { db } from "./db";
import { sha256 } from "./auth";
import { HttpError } from "./http";

export type Participant = {
  id: string;
  session_id: string;
  display_name: string;
  score: number;
  attempt: number;
  finished: boolean;
  current_index: number;
  question_started_at: Date | null;
};

export const participantCookie = (sessionId: string) => `pt_${sessionId}`;

export async function requireParticipant(sessionId: string): Promise<Participant> {
  const token = (await cookies()).get(participantCookie(sessionId))?.value;
  if (!token) throw new HttpError(401, "Join the game first");
  const [p] = await db()<Participant[]>`
    select id, session_id, display_name, score, attempt, finished, current_index, question_started_at
    from participants where session_id = ${sessionId} and token_hash = ${sha256(token)}`;
  if (!p) throw new HttpError(401, "Join the game first");
  return p;
}
