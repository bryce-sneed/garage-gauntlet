import { afterEach, describe,it,expect } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createGameServer } from '../server/app';
import type { Ack, RoomView } from '../shared/types';

const servers:ReturnType<typeof createGameServer>[]=[];const sockets:Socket[]=[];
afterEach(async()=>{for(const s of sockets.splice(0))s.disconnect();for(const s of servers.splice(0))await s.close();});
async function fixture(roundMs=250){const server=createGameServer({roundMs,hostGraceMs:60});servers.push(server);await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;return {server,url};}
async function client(url:string){const s=io(url,{forceNew:true,transports:['websocket'],reconnection:false});sockets.push(s);await new Promise<void>((r,j)=>{s.on('connect',r);s.on('connect_error',j);});return s;}
async function command(s:Socket,event:string,data:Record<string,unknown>={}):Promise<Extract<Ack,{ok:true}>>{const a:Ack=await s.timeout(2000).emitWithAck(event,data);if(!a.ok)throw new Error(a.error);return a;}
function waitState(s:Socket,test:(v:RoomView)=>boolean){return new Promise<RoomView>((r,j)=>{const timer=setTimeout(()=>{s.off('state',fn);j(new Error('Expected state was not received'));},2500);function fn(v:RoomView){if(test(v)){clearTimeout(timer);s.off('state',fn);r(v);}}s.on('state',fn);});}
describe('real Socket.IO connections',()=>{
  it('synchronizes two independent clients through ten rounds, refresh and replay without client timers',async()=>{
    const {server,url}=await fixture();const host=await client(url);let guest=await client(url);
    const created=await command(host,'create',{name:'Host'});const code=created.session!.code;
    const updated=waitState(host,v=>v.players.length===2);const joined=await command(guest,'join',{name:'Guest',code});await updated;
    const hStart=waitState(host,v=>v.phase==='question');const gStart=waitState(guest,v=>v.phase==='question');await command(host,'start');
    let h=await hStart;let g=await gStart;expect(h.deadline).toBe(g.deadline);expect(h.roundId).toBe(g.roundId);
    const originalGuest=guest;guest.disconnect();guest=await client(url);const restored=await command(guest,'resume',{...joined.session!});expect(restored.state!.youId).toBe(joined.state!.youId);expect(restored.state!.deadline).toBe(h.deadline);expect(originalGuest.connected).toBe(false);
    for(let round=1;round<=10;round++){
      const right=server.game.get(code).deck[round-1].correct;
      const hReveal=waitState(host,v=>v.phase==='reveal'&&v.round===round);const gReveal=waitState(guest,v=>v.phase==='reveal'&&v.round===round);
      await command(host,'answer',{roundId:h.roundId,choice:right,score:999999,playerId:g.youId});
      await command(guest,'answer',{roundId:h.roundId,choice:(right+1)%4});
      const hr=await hReveal;const gr=await gReveal;expect(hr.reveal).toEqual(gr.reveal);expect(hr.players[0].score).toBeLessThanOrEqual(round*1000);expect(hr.players.find(p=>p.id===g.youId)!.score).toBe(0);
      const nextPhase=round===10?'final':'question';const nh=waitState(host,v=>v.phase===nextPhase);const ng=waitState(guest,v=>v.phase===nextPhase);await command(host,'next',{roundId:hr.roundId});h=await nh;g=await ng;expect(h.deadline).toBe(g.deadline);
    }
    expect(h.phase).toBe('final');const late=await client(url);await expect(command(late,'join',{code,name:'Too late'})).rejects.toThrow('finished');
    const replay=waitState(guest,v=>v.phase==='question'&&v.round===1);await command(host,'start');const reset=await replay;expect(reset.players.every(p=>p.score===0)).toBe(true);
  },10_000);
  it('isolates rooms, enforces capacity, handles invalid codes and blocks non-host advancement',async()=>{
    const {url}=await fixture(1000);const a=await client(url);const b=await client(url);
    const roomA=await command(a,'create',{name:'A'});const roomB=await command(b,'create',{name:'B'});
    const outsider=await client(url);await expect(command(outsider,'join',{code:'ZZZZZ',name:'Invalid'})).rejects.toThrow('not found');
    await expect(command(outsider,'resume',{...roomA.session,token:roomB.session!.token})).rejects.toThrow('expired');
    for(let i=1;i<12;i++){const s=await client(url);await command(s,'join',{code:roomA.session!.code,name:`P${i}`});}
    await expect(command(outsider,'join',{code:roomA.session!.code,name:'Overflow'})).rejects.toThrow('full');
    const guest=sockets[sockets.length-1];await expect(command(guest,'start')).rejects.toThrow('host');await command(a,'start');
    const other=await command(b,'sync');expect(other.state!.phase).toBe('lobby');expect(other.state!.players).toHaveLength(1);
  });
  it('continues to reveal and transfers control when the host disconnects',async()=>{
    const {url}=await fixture(250);const a=await client(url);const b=await client(url);const created=await command(a,'create',{name:'A'});const joined=await command(b,'join',{code:created.session!.code,name:'B'});
    await command(a,'start');const transferred=waitState(b,v=>v.hostId===joined.state!.youId);const reveal=waitState(b,v=>v.phase==='reveal');a.disconnect();await transferred;const state=await reveal;
    await command(b,'next',{roundId:state.roundId});
  });
  it('rejects cross-origin browser connections',async()=>{
    const {url}=await fixture();const bad=io(url,{forceNew:true,transports:['websocket'],reconnection:false,extraHeaders:{Origin:'https://unrelated.example'}});sockets.push(bad);
    const error=await new Promise<Error>(r=>bad.on('connect_error',r));expect(error).toBeTruthy();expect(bad.connected).toBe(false);
  });
});
