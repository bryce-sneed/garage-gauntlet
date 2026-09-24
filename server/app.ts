import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server, type Socket } from 'socket.io';
import { Game, type Room } from './game.js';
import type { Ack } from '../shared/types.js';

export function createGameServer(options: {roundMs?:number; hostGraceMs?:number} = {}) {
  const app=express();
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:process.env.NODE_ENV==='production' ? {
    directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"]}
  } : false, strictTransportSecurity:process.env.NODE_ENV==='production' ? undefined : false}));
  const http=createServer(app);
  const io=new Server(http,{serveClient:false,maxHttpBufferSize:4096,pingInterval:10_000,pingTimeout:10_000,
    allowRequest:(req,done)=>{
      if (!req.headers.origin) return done(null,true);
      try { done(null,new URL(req.headers.origin).host===req.headers.host); } catch { done(null,false); }
    }
  });
  const game=new Game(options.roundMs);
  const roundTimers=new Map<string,ReturnType<typeof setTimeout>>();
  const hostTimers=new Map<string,ReturnType<typeof setTimeout>>();
  const broadcast=(room:Room)=>{
    for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('state',game.view(room,p.id));
  };
  function schedule(room:Room) {
    clearTimeout(roundTimers.get(room.code));
    roundTimers.delete(room.code);
    if (room.phase!=='question') return;
    const roundId=room.roundId;
    const timer=setTimeout(()=>{
      if (room.roundId!==roundId) return;
      if (game.end(room)) { roundTimers.delete(room.code); broadcast(room); }
      else schedule(room); // Timers can fire just before the wall-clock deadline.
    },Math.max(1,room.deadline-Date.now()));
    timer.unref(); roundTimers.set(room.code,timer);
  }
  function current(socket:Socket) {
    const room=game.get(socket.data.code);
    const player=game.member(room,socket.data.playerId);
    if (player.socketId!==socket.id) throw new Error('This session is active in another tab.');
    if (game.end(room)) broadcast(room);
    return {room,player};
  }
  function attach(socket:Socket,room:Room,player:{id:string;token:string}) {
    socket.data.code=room.code; socket.data.playerId=player.id;
    if (player.id===room.hostId) { clearTimeout(hostTimers.get(room.code)); hostTimers.delete(room.code); }
    else if (!room.players.find(p=>p.id===room.hostId)?.socketId && !hostTimers.has(room.code)) game.transferHost(room);
    return {ok:true as const,session:{code:room.code,token:player.token},state:game.view(room,player.id)};
  }
  io.on('connection',socket=>{
    let windowStart=Date.now(), count=0;
    function on(event:string,fn:(data:Record<string,unknown>)=>Ack) {
      socket.on(event,(data:unknown,ack:unknown)=>{
        if (typeof ack!=='function') return;
        try {
          if (Date.now()-windowStart>5000) {count=0;windowStart=Date.now();}
          if (++count>60) throw new Error('Too many requests. Take a breath and try again.');
          if (typeof data!=='object' || !data || Array.isArray(data)) throw new Error('Invalid request.');
          const result=fn(data as Record<string,unknown>);
          ack(result);
        } catch (e) { ack({ok:false,error:e instanceof Error ? e.message : 'Something went wrong. Try again.'}); }
      });
    }
    const checkNew=()=>{if(socket.data.code) throw new Error('You are already in a room.');};
    on('create',data=>{checkNew();const {room,player}=game.create(data.name,socket.id);const result=attach(socket,room,player);broadcast(room);return result;});
    on('join',data=>{checkNew();const {room,player}=game.join(data.code,data.name,socket.id);const result=attach(socket,room,player);broadcast(room);return result;});
    on('resume',data=>{
      if(socket.data.code) throw new Error('You are already in a room.');
      const {room,player,previousSocket}=game.resume(data.code,data.token,socket.id);
      if(previousSocket && previousSocket!==socket.id) { const old=io.sockets.sockets.get(previousSocket);old?.emit('session-replaced');old?.disconnect(true); }
      game.end(room); const result=attach(socket,room,player);broadcast(room);return result;
    });
    on('sync',()=>{const {room,player}=current(socket);return {ok:true,state:game.view(room,player.id),serverNow:Date.now()};});
    on('clock',()=>({ok:true,serverNow:Date.now()}));
    on('start',()=>{const {room}=current(socket);game.start(room,socket.data.playerId);schedule(room);broadcast(room);return {ok:true};});
    on('answer',data=>{const {room}=current(socket);game.answer(room,socket.data.playerId,data.roundId,data.choice);broadcast(room);return {ok:true,state:game.view(room,socket.data.playerId)};});
    on('next',data=>{const {room}=current(socket);game.next(room,socket.data.playerId,data.roundId);schedule(room);broadcast(room);return {ok:true};});
    on('leave',()=>{const {room}=current(socket);game.leave(room,socket.data.playerId);delete socket.data.code;delete socket.data.playerId;broadcast(room);return {ok:true};});
    socket.on('disconnect',()=>{
      if(!socket.data.code) return;
      try {
        const room=game.get(socket.data.code);
        game.disconnect(room,socket.data.playerId,socket.id);broadcast(room);
        if(room.hostId===socket.data.playerId && !room.players.find(p=>p.id===room.hostId)?.socketId) {
          clearTimeout(hostTimers.get(room.code));
          const timer=setTimeout(()=>{hostTimers.delete(room.code);game.transferHost(room);broadcast(room);},options.hostGraceMs??15_000);
          timer.unref();hostTimers.set(room.code,timer);
        }
      } catch { /* Room may have expired. */ }
    });
  });
  const prune=setInterval(()=>{
    for (const [code,room] of game.rooms) if (Date.now()-room.updatedAt>2*60*60*1000 && !room.players.some(p=>p.socketId)) {
      clearTimeout(roundTimers.get(code));roundTimers.delete(code);clearTimeout(hostTimers.get(code));hostTimers.delete(code);game.rooms.delete(code);
    }
  },60_000);prune.unref();
  app.get('/health',(_req,res)=>res.json({status:'ok'}));
  function serveProduction() {
    app.use(express.static(resolve('dist'),{index:false,maxAge:'1h'}));
    app.get('/{*path}',(_req,res)=>res.set('Cache-Control','no-store').sendFile(resolve('dist/index.html')));
  }
  async function close() {
    clearInterval(prune);for(const t of roundTimers.values())clearTimeout(t);for(const t of hostTimers.values())clearTimeout(t);
    await new Promise<void>(resolve=>io.close(()=>resolve()));
  }
  return {app,http,io,game,serveProduction,close};
}
