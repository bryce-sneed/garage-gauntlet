import { describe,it,expect } from 'vitest';
import { Game, pointsFor, TOTAL_ROUNDS } from '../server/game';
import { scenarios } from '../server/scenarios';

function setup(){let now=100_000;const game=new Game(20_000,()=>now);const {room,player:host}=game.create('Host','s1');const {player:guest}=game.join(room.code,'Guest','s2');return{game,room,host,guest,advance:(ms:number)=>{now+=ms;}};}
describe('scenario integrity',()=>{
  it('has exactly 20 original, complete, uniquely identified cards covering seven categories',()=>{
    expect(scenarios).toHaveLength(20);expect(new Set(scenarios.map(s=>s.id)).size).toBe(20);expect(new Set(scenarios.map(s=>s.category)).size).toBe(7);
    for(const s of scenarios){expect(s.clues.length).toBeGreaterThanOrEqual(2);expect(s.clues.length).toBeLessThanOrEqual(4);expect(s.choices).toHaveLength(4);expect(new Set(s.choices).size).toBe(4);expect(Number.isInteger(s.correct)).toBe(true);expect(s.correct).toBeGreaterThanOrEqual(0);expect(s.correct).toBeLessThan(4);expect(s.explanation.length).toBeGreaterThan(30);expect(['easy','medium','hard']).toContain(s.difficulty);}
  });
});
describe('server-authoritative game rules',()=>{
  it('validates codes, names, capacity and the minimum start count',()=>{
    const game=new Game();const {room,player}=game.create('Host','s');
    expect(()=>game.start(room,player.id)).toThrow('two connected');
    expect(()=>game.get('ZZZZZ')).toThrow('not found');expect(()=>game.get('!!')).toThrow('valid');
    expect(()=>game.join(room.code,' host ','x')).toThrow('already');
    expect(()=>game.create('','x')).toThrow();expect(()=>game.create('<script>','x')).toThrow();
    for(let i=1;i<12;i++)game.join(room.code,`Player ${i}`,`s${i}`);
    expect(room.players).toHaveLength(12);expect(()=>game.join(room.code,'Overflow','x')).toThrow('full');
  });
  it('awards 1000 at start, 750 halfway, 500 at deadline; clamps input',()=>{
    expect(pointsFor(0)).toBe(1000);expect(pointsFor(10000)).toBe(750);expect(pointsFor(20000)).toBe(500);expect(pointsFor(-99)).toBe(1000);expect(pointsFor(99000)).toBe(500);
  });
  it('hides answer keys and other player selections until reveal',()=>{
    const {game,room,host,guest}=setup();game.start(room,host.id);game.answer(room,host.id,room.roundId,2);
    const view=game.view(room,guest.id);expect(view.ownAnswer).toBe(null);expect(view.reveal).toBe(null);expect(view.question).not.toHaveProperty('correct');expect(view.question).not.toHaveProperty('explanation');expect(JSON.stringify(view)).not.toContain(host.token);
  });
  it('uses final changed selection time, rejects late/invalid/stale answers and scores once',()=>{
    const {game,room,host,guest,advance}=setup();game.start(room,host.id);const right=room.deck[0].correct;
    game.answer(room,host.id,room.roundId,(right+1)%4);advance(10000);game.answer(room,host.id,room.roundId,right);advance(5000);game.answer(room,host.id,room.roundId,right);
    expect(()=>game.answer(room,guest.id,room.roundId,99)).toThrow();expect(()=>game.answer(room,guest.id,'old-round',right)).toThrow();
    advance(5000);expect(()=>game.answer(room,guest.id,room.roundId,right)).toThrow('closed');
    expect(game.end(room)).toBe(true);expect(host.score).toBe(750);expect(guest.score).toBe(0);expect(guest.result).toBe('unanswered');expect(game.end(room)).toBe(false);expect(host.score).toBe(750);
  });
  it('enforces host rights, ten unique rounds, ordering, final admission rules and replay',()=>{
    const {game,room,host,guest,advance}=setup();expect(()=>game.start(room,guest.id)).toThrow('host');game.start(room,host.id);
    expect(new Set(room.deck.map(s=>s.id)).size).toBe(10);expect(()=>game.join(room.code,'Late','late')).toThrow('started');
    for(let i=0;i<TOTAL_ROUNDS;i++){
      const roundId=room.roundId;game.answer(room,guest.id,roundId,room.deck[i].correct);advance(20000);game.end(room);
      expect(game.view(room,host.id).players[0].id).toBe(guest.id);expect(()=>game.next(room,guest.id,roundId)).toThrow('host');
      game.next(room,host.id,roundId);expect(()=>game.next(room,host.id,roundId)).toThrow();
    }
    expect(room.phase).toBe('final');expect(guest.score).toBe(10000);expect(()=>game.join(room.code,'Late','late')).toThrow('finished');
    game.start(room,host.id);expect(room.phase).toBe('question');expect(room.round).toBe(1);expect(room.players.every(p=>p.score===0)).toBe(true);
  });
  it('preserves score/answer on refresh, rejects a forged token, and transfers a missing host',()=>{
    const {game,room,host,guest}=setup();game.start(room,host.id);game.answer(room,guest.id,room.roundId,1);game.disconnect(room,guest.id,'s2');
    expect(()=>game.resume(room.code,'forged','s3')).toThrow('expired');game.resume(room.code,guest.token,'s3');expect(guest.answer?.choice).toBe(1);
    game.disconnect(room,guest.id,'s2');expect(guest.socketId).toBe('s3');game.disconnect(room,host.id,'s1');game.transferHost(room);expect(room.hostId).toBe(guest.id);
  });
  it('represents equal scores as tied ranks',()=>{const {game,room,host}=setup();expect(game.view(room,host.id).players.map(p=>p.rank)).toEqual([1,1]);});
  it('frees a lobby slot on explicit leave and transfers host immediately',()=>{const {game,room,host,guest}=setup();game.leave(room,host.id);expect(room.players).toHaveLength(1);expect(room.hostId).toBe(guest.id);game.join(room.code,'Host','new');expect(room.players).toHaveLength(2);});
});
