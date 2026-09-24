export type Difficulty = 'easy' | 'medium' | 'hard';
export interface Scenario {
  id: string; category: string; title: string; vehicle: string; clues: string[];
  choices: [string, string, string, string]; correct: number; explanation: string; difficulty: Difficulty;
}
export type Phase = 'lobby' | 'question' | 'reveal' | 'final';
export interface PublicPlayer {
  id: string; name: string; score: number; connected: boolean; rank: number;
  roundPoints: number; result: 'correct' | 'incorrect' | 'unanswered' | null;
}
export interface RoomView {
  code: string; phase: Phase; hostId: string; youId: string; players: PublicPlayer[];
  round: number; totalRounds: number; roundId: string; deadline: number; roundMs: number;
  serverNow: number; revision: number; submitted: number; ownAnswer: number | null;
  question: Omit<Scenario, 'correct' | 'explanation'> | null;
  reveal: { correct: number; explanation: string } | null;
}
export interface Session { code: string; token: string }
export type Ack = { ok: true; state?: RoomView; session?: Session; serverNow?: number } | { ok: false; error: string };
