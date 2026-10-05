import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.mp4':'video/mp4','.md':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // A project subdirectory exercises the same relative paths as GitHub Pages.
    if(url.startsWith('/DojoFlow/'))url=url.slice('/DojoFlow'.length);
    if(url==='/vendor/ffmpeg/' || url==='/vendor/core/')throw Error();
    url=url.replace(/^\/vendor\/ffmpeg\//,'/node_modules/@ffmpeg/ffmpeg/dist/esm/').replace(/^\/vendor\/core\//,'/node_modules/@ffmpeg/core/dist/esm/');
    if(url.endsWith('/'))url+='index.html';
    const file=path.resolve(root,'.'+url);
    if(!file.startsWith(root)||file.includes('/.git/'))throw Error();
    let data=await readFile(file);
    if(url==='/sw.js'){
      const hash=createHash('sha256');
      for(const name of ['index.html','styles.css','app.js','player.js','storage.js','media.js','pwa.js','manifest.webmanifest'])hash.update(await readFile(path.join(root,name)));
      data=Buffer.from(data.toString().replace('__BUILD_ID__',hash.digest('hex').slice(0,16)));
    }
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range){
      const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):data.length-1,data.length-1);
      if(start>end){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});return res.end();}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});return res.end(data.subarray(start,end+1));
    }
    res.writeHead(200,{...headers,'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Introuvable');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('DojoFlow : http://127.0.0.1:'+ (process.env.PORT||4173)));
