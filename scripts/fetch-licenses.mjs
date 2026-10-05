import {mkdir,writeFile} from 'node:fs/promises';
await mkdir(new URL('../licenses/',import.meta.url),{recursive:true});
const sources={
  'x265-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/x265/3.4/COPYING',
  'lame-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/lame/master/COPYING',
  'emscripten-LICENSE.txt':'https://raw.githubusercontent.com/emscripten-core/emscripten/3.1.40/LICENSE',
  'ffmpeg-wasm-MIT.txt':'https://raw.githubusercontent.com/ffmpegwasm/ffmpeg.wasm/v12.15/LICENSE',
  'FFmpeg-GPL-2.0.txt':'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n5.1.4/COPYING.GPLv2',
  'FFmpeg-LGPL-2.1.txt':'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n5.1.4/COPYING.LGPLv2.1',
  'x264-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/x264/4-cores/COPYING',
  'libvpx-LICENSE.txt':'https://raw.githubusercontent.com/ffmpegwasm/libvpx/v1.13.1/LICENSE',
  'libvpx-PATENTS.txt':'https://raw.githubusercontent.com/ffmpegwasm/libvpx/v1.13.1/PATENTS',
  'opus-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/opus/v1.3.1/COPYING',
  'vorbis-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/vorbis/v1.3.3/COPYING',
  'ogg-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/Ogg/v1.3.4/COPYING',
  'theora-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/theora/v1.1.1/COPYING',
  'zlib-LICENSE.txt':'https://raw.githubusercontent.com/ffmpegwasm/zlib/v1.2.11/README',
  'webp-COPYING.txt':'https://raw.githubusercontent.com/ffmpegwasm/libwebp/v1.3.2/COPYING',
  'freetype-LICENSE.txt':'https://raw.githubusercontent.com/ffmpegwasm/freetype2/VER-2-10-4/docs/FTL.TXT',
  'harfbuzz-COPYING.txt':'https://raw.githubusercontent.com/harfbuzz/harfbuzz/5.2.0/COPYING',
  'fribidi-COPYING.txt':'https://raw.githubusercontent.com/fribidi/fribidi/v1.0.9/COPYING',
  'libass-COPYING.txt':'https://raw.githubusercontent.com/libass/libass/0.15.0/COPYING',
  'zimg-COPYING.txt':'https://raw.githubusercontent.com/sekrit-twc/zimg/release-3.0.5/COPYING'
};
const results=await Promise.all(Object.entries(sources).map(async([file,url])=>{
  const response=await fetch(url);if(!response.ok){console.log(file,response.status);return false;}
  await writeFile(new URL('../licenses/'+file,import.meta.url),await response.text());return true;
}));
await writeFile(new URL('../licenses/SOURCES.json',import.meta.url),JSON.stringify(sources,null,2)+'\n');
console.log(results.filter(Boolean).length+'/'+results.length+' licences téléchargées');
if(results.some(v=>!v))process.exitCode=1;
