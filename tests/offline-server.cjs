// WebKit's Playwright offline flag rejects even service-worker responses.
// Turn off a disposable origin instead, and verify a fresh browser cannot reach it.
// Upstream: https://github.com/microsoft/playwright/issues/42775
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
module.exports=async function offlineServer(){
  const root=path.resolve(__dirname,'..');
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.mp4':'video/mp4','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
  const server=http.createServer(async(req,res)=>{
    try{
      let relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
      if(process.env.TEST_URL){
        const response=await fetch(new URL(relative,process.env.TEST_URL));
        res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      relative=relative.replace(/^vendor\/ffmpeg\//,'node_modules/@ffmpeg/ffmpeg/dist/esm/').replace(/^vendor\/core\//,'node_modules/@ffmpeg/core/dist/esm/');
      const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error();
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
};
