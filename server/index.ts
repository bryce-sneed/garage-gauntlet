import { createGameServer } from './app.js';
const server=createGameServer();
if(process.env.NODE_ENV==='production') server.serveProduction();
else {
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  server.app.use(vite.middlewares);
}
const port=Number(process.env.PORT||3000);
server.http.listen(port,'0.0.0.0',()=>console.log(`Garage Gauntlet listening on port ${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
