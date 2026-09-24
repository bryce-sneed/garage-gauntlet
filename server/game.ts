import { randomInt, randomUUID } from 'node:crypto';
import type { Phase, RoomView, Scenario } from '../shared/types.js';
import { scenarios } from './scenarios.js';

interface Player {
  id: string; token: string; name: string; score: number; joined: number;
  socketId: string | null; answer: { choice: number; at: number } | null;
  roundPoints: number; result: 'correct' | 'incorrect' | 'unanswered' | null;
}
export interface Room {
  code: string; phase: Phase; hostId: string; players: Player[];
  deck: Scenario[]; round: number; roundId: string; deadline: number;
  revision: number; updatedAt: number;
}
export const ROUND_MS = 20_000;
export const TOTAL_ROUNDS = 10;
export function pointsFor(elapsedMs: number, roundMs = ROUND_MS) {
  return 500 + Math.round(500 * Math.max(0, Math.min(1, 1 - elapsedMs / roundMs)));
}
export class Game {
  rooms = new Map<string, Room>();
  constructor(public roundMs = ROUND_MS, private now = Date.now) {}
  private touch(room: Room) { room.revision++; room.updatedAt = this.now(); }
  private name(input: unknown) {
    if (typeof input !== 'string') throw new Error('Enter a display name.');
    const name = input.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (name.length < 1 || name.length > 18 || /[\p{C}<>]/u.test(name)) throw new Error('Use a name with 1–18 letters, numbers, or friendly symbols.');
    return name;
  }
  get(code: unknown) {
    if (typeof code !== 'string' || !/^[A-Z2-9]{5}$/.test(code.toUpperCase().trim())) throw new Error('Enter a valid 5-character room code.');
    const room = this.rooms.get(code.toUpperCase().trim());
    if (!room) throw new Error('Room not found. Check the code or create a new room.');
    return room;
  }
  create(input: unknown, socketId: string) {
    const name = this.name(input);
    if (this.rooms.size >= 500) throw new Error('The garage is busy. Try again in a moment.');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do { code = Array.from({length:5}, () => alphabet[randomInt(alphabet.length)]).join(''); } while (this.rooms.has(code));
    const player = this.player(name, socketId);
    const room: Room = { code, phase:'lobby', hostId:player.id, players:[player], deck:[], round:0, roundId:'', deadline:0, revision:1, updatedAt:this.now() };
    this.rooms.set(code, room);
    return {room, player};
  }
  private player(name: string, socketId: string): Player {
    return {id:randomUUID(), token:randomUUID(), name, socketId, joined:this.now(), score:0, answer:null, roundPoints:0, result:null};
  }
  join(code: unknown, input: unknown, socketId: string) {
    const room = this.get(code);
    if (room.phase !== 'lobby') throw new Error(room.phase === 'final' ? 'This game has finished. Create a new room to play.' : 'This game has started. Join a room that is still in the lobby.');
    const name = this.name(input);
    if (room.players.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('That name is already in the garage. Pick another.');
    if (room.players.length >= 12) throw new Error('This room is full (12 players). Create a new room.');
    const player = this.player(name, socketId);
    room.players.push(player); this.touch(room);
    return {room, player};
  }
  resume(code: unknown, token: unknown, socketId: string) {
    const room = this.get(code);
    if (typeof token !== 'string') throw new Error('Your session has expired. Join a room again.');
    const player = room.players.find(p => p.token === token);
    if (!player) throw new Error('Your session has expired. Join a room again.');
    const previousSocket = player.socketId;
    player.socketId = socketId; this.touch(room);
    return {room, player, previousSocket};
  }
  member(room: Room, id: string) {
    const player = room.players.find(p => p.id === id);
    if (!player) throw new Error('Join this room first.');
    return player;
  }
  start(room: Room, id: string) {
    if (room.hostId !== id) throw new Error('Only the host can start the game.');
    if (!['lobby','final'].includes(room.phase)) throw new Error('A game is already in progress.');
    if (room.players.filter(p => p.socketId).length < 2) throw new Error('At least two connected players are needed.');
    room.players = room.players.filter(p => p.socketId);
    const deck = [...scenarios];
    for (let i=deck.length-1;i>0;i--) { const j=randomInt(i+1); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    room.deck = deck.slice(0,TOTAL_ROUNDS);
    room.round = 0;
    for (const p of room.players) p.score = 0;
    this.beginRound(room);
  }
  private beginRound(room: Room) {
    room.round++; room.phase='question'; room.roundId=randomUUID(); room.deadline=this.now()+this.roundMs;
    for (const p of room.players) { p.answer=null; p.roundPoints=0; p.result=null; }
    this.touch(room);
  }
  answer(room: Room, id: string, roundId: unknown, choice: unknown) {
    if (room.phase !== 'question' || this.now() >= room.deadline || roundId !== room.roundId) throw new Error('This round is closed.');
    if (!Number.isInteger(choice) || (choice as number)<0 || (choice as number)>3) throw new Error('Choose one of the four diagnoses.');
    const p = this.member(room,id);
    // Re-delivery of the same selection must not change its scoring timestamp.
    if (p.answer?.choice === choice) return;
    p.answer = {choice:choice as number, at:this.now()};
    this.touch(room);
  }
  end(room: Room) {
    if (room.phase !== 'question' || this.now() < room.deadline) return false;
    const q = room.deck[room.round-1];
    for (const p of room.players) {
      p.result = p.answer ? (p.answer.choice === q.correct ? 'correct' : 'incorrect') : 'unanswered';
      p.roundPoints = p.result === 'correct' ? pointsFor(p.answer!.at-(room.deadline-this.roundMs),this.roundMs) : 0;
      p.score += p.roundPoints;
    }
    room.phase='reveal'; this.touch(room); return true;
  }
  next(room: Room, id: string, roundId: unknown) {
    if (id !== room.hostId) throw new Error('Only the host can advance the game.');
    if (room.phase !== 'reveal' || room.roundId !== roundId) throw new Error('Wait for the current round results.');
    if (room.round === TOTAL_ROUNDS) { room.phase='final'; this.touch(room); }
    else this.beginRound(room);
  }
  disconnect(room: Room, id: string, socketId: string) {
    const player=this.member(room,id);
    if (player.socketId !== socketId) return;
    player.socketId=null; this.touch(room);
  }
  transferHost(room: Room) {
    if (room.players.find(p=>p.id===room.hostId)?.socketId) return;
    const candidate=room.players.find(p=>p.socketId);
    if (candidate) { room.hostId=candidate.id; this.touch(room); }
  }
  leave(room: Room, id: string) {
    const player=this.member(room,id);player.socketId=null;
    if(room.phase==='lobby') room.players=room.players.filter(p=>p.id!==id);
    this.transferHost(room);this.touch(room);
  }
  view(room: Room, id: string): RoomView {
    const own=this.member(room,id);
    const sorted=[...room.players].sort((a,b)=>b.score-a.score || a.joined-b.joined || a.id.localeCompare(b.id));
    let rank=1;
    const players=sorted.map((p,i)=>{
      if (i && p.score !== sorted[i-1].score) rank=i+1;
      return {id:p.id,name:p.name,score:p.score,connected:!!p.socketId,rank,roundPoints:p.roundPoints,result:p.result};
    });
    const q=room.deck[room.round-1];
    const question=q ? {id:q.id,category:q.category,title:q.title,vehicle:q.vehicle,clues:q.clues,choices:q.choices,difficulty:q.difficulty} : null;
    return {code:room.code,phase:room.phase,hostId:room.hostId,youId:id,players,round:room.round,totalRounds:TOTAL_ROUNDS,roundId:room.roundId,deadline:room.deadline,roundMs:this.roundMs,revision:room.revision,serverNow:this.now(),submitted:room.players.filter(p=>p.answer).length,ownAnswer:own.answer?.choice??null,question,reveal:q && ['reveal','final'].includes(room.phase) ? {correct:q.correct,explanation:q.explanation} : null};
  }
}
