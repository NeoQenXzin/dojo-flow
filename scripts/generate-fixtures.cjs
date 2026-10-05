const {chromium}=require('@playwright/test');
const fs=require('node:fs');
(async()=>{
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser=await chromium.launch(fs.existsSync(chrome)?{executablePath:chrome}:{});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:4174/DojoFlow/');
    const files=await page.evaluate(async()=>{
      const {FFmpeg}=await import('./vendor/ffmpeg/index.js');const ff=new FFmpeg();
      await ff.load({coreURL:new URL('vendor/core/ffmpeg-core.js',location.href).href,wasmURL:new URL('vendor/core/ffmpeg-core.wasm',location.href).href});
      const logs=[];ff.on('log',e=>logs.push(e.message));
      const run=async args=>{if(await ff.exec(args))throw Error(logs.slice(-8).join('\n'));};
      await run(['-f','lavfi','-i','testsrc2=size=160x120:rate=10','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','sample.mp4']);
      await run(['-i','sample.mp4','-c','copy','sample.mkv']);
      await run(['-i','sample.mp4','-c:v','libvpx','-b:v','100k','sample.webm']);
      const result={};for(const name of ['sample.mp4','sample.mkv','sample.webm'])result[name]=Array.from(await ff.readFile(name));ff.terminate();return result;
    });
    fs.mkdirSync('tests/fixtures',{recursive:true});
    for(const [name,data] of Object.entries(files))fs.writeFileSync('tests/fixtures/'+name,Buffer.from(data));
    fs.writeFileSync('test-video.mp4',Buffer.from(files['sample.mp4']));
    console.log('Vidéos de test générées : MP4 H.264, MKV H.264, WebM VP8.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
