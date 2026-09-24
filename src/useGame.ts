import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, RoomView, Session } from '../shared/types';
const KEY='garage-gauntlet-session';
function load():Session|null {try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function save(session:Session|null){try{session ? sessionStorage.setItem(KEY,JSON.stringify(session)) : sessionStorage.removeItem(KEY);}catch{/* The active socket still works if storage is unavailable. */}}
export function useGame() {
  const [state,setState]=useState<RoomView|null>(null);
  const [connected,setConnected]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [offset,setOffset]=useState(0);
  const socketRef=useRef<Socket|null>(null);
  const sessionRef=useRef<Session|null>(load());
  const clockReady=useRef(false);
  const samples=useRef<{rtt:number;offset:number}[]>([]);
  const accept=useCallback((next:RoomView)=>{
    if(!clockReady.current){setOffset(next.serverNow-Date.now());}
    setState(previous=>!previous || previous.code!==next.code || next.revision>=previous.revision ? next : previous);
  },[]);
  useEffect(()=>{
    const socket=io({autoConnect:false,reconnection:true,reconnectionDelay:500,reconnectionDelayMax:3000,timeout:10_000});
    socketRef.current=socket;
    async function sampleClock(){
      if(!socket.connected)return;
      const sent=Date.now();
      try {
        const result:Ack=await socket.timeout(4000).emitWithAck('clock',{});
        const received=Date.now();
        if(result.ok && result.serverNow){
          samples.current.push({rtt:received-sent,offset:result.serverNow-(sent+received)/2});
          samples.current=samples.current.slice(-8);
          const best=[...samples.current].sort((a,b)=>a.rtt-b.rtt)[0];
          clockReady.current=true;setOffset(best.offset);
        }
      }catch{/* Next sample retries after a brief network interruption. */}
    }
    socket.on('connect',async()=>{
      samples.current=[];clockReady.current=false;
      if(sessionRef.current){
        try{
          const result:Ack=await socket.timeout(6000).emitWithAck('resume',sessionRef.current);
          if(result.ok && result.state){accept(result.state);setError('');}
          else if(!result.ok){sessionRef.current=null;save(null);setState(null);setError(result.error);}
        }catch{setError('Could not restore your session. Reconnecting…');socket.disconnect();socket.connect();return;}
      }
      setConnected(true);void sampleClock();
    });
    socket.on('state',accept);
    socket.on('disconnect',()=>{setConnected(false);setPending(false);});
    socket.on('connect_error',()=>setConnected(false));
    socket.on('session-replaced',()=>{sessionRef.current=null;save(null);setError('Your player session was opened in another tab. Use that tab, or return to the garage.');});
    socket.connect();
    const timer=setInterval(()=>{
      void sampleClock();
      if(socket.connected && sessionRef.current) socket.timeout(4000).emit('sync',{},(err:Error|null,result:Ack)=>{if(!err && result.ok && result.state)accept(result.state);});
    },5000);
    return()=>{clearInterval(timer);socket.removeAllListeners();socket.disconnect();socketRef.current=null;};
  },[accept]);
  const request=useCallback(async(event:string,data:Record<string,unknown>={})=>{
    const socket=socketRef.current;
    if(!socket?.connected){setError('Connection interrupted. Wait for reconnection and try again.');return false;}
    setPending(true);setError('');
    try{
      const result:Ack=await socket.timeout(6000).emitWithAck(event,data);
      if(!result.ok){setError(result.error);return false;}
      if(result.session){sessionRef.current=result.session;save(result.session);}
      if(result.state)accept(result.state);
      return true;
    }catch{setError('The server didn’t confirm that action. Check your connection and try again.');return false;}
    finally{setPending(false);}
  },[accept]);
  async function leave(){if(socketRef.current?.connected)await request('leave');save(null);window.location.assign(window.location.pathname);}
  return {state,connected,pending,error,setError,offset,request,leave};
}
