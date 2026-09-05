import type { Artworks } from "./index.js";
import { ART_LIBRARY } from "./art.js";
/** Generated code lives only in a worker inside an opaque-origin, networkless frame. */
export function sceneDocument(
  code: string,
  token: string,
  artworks: Artworks = {},
  world: unknown = {},
): string {
  const worker = `${ART_LIBRARY}
const paint = function(ctx, art, time, pointer, memory) {\n${code}\n};
let canvas,ctx,art;const memory={};let images={};
self.onmessage=async ({data})=>{
 try {
  if(data.artworks){for(const [key,image] of Object.entries(data.artworks)){const bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));images[key]=await createImageBitmap(new Blob([bytes],{type:image.mimeType}))}self.postMessage({loaded:true});return}
  if(!canvas){canvas=new OffscreenCanvas(data.width,data.height);ctx=canvas.getContext('2d');art=makeArt(ctx);art.images=images;art.image=(key,x,y,w,h)=>{if(!images[key])throw new Error("Missing artwork: "+key);ctx.drawImage(images[key],x,y,w,h)}}
  if(data.frame){
   if(canvas.width!==data.width||canvas.height!==data.height){canvas.width=data.width;canvas.height=data.height}
   ctx.reset();const scale=Math.max(canvas.width/1200,canvas.height/760);ctx.translate((canvas.width-1200*scale)/2,(canvas.height-760*scale)/2);ctx.scale(scale,scale);
   art.world=data.world;paint(ctx,art,data.time,data.pointer,memory);
   const bitmap=canvas.transferToImageBitmap();self.postMessage({bitmap},[bitmap]);
  }
 } catch(error){self.postMessage({error:String(error)})}
};`;
  // Escaping '<' prevents even a literal </script> in generated source leaving the JSON string.
  const literal = (value: string) =>
    JSON.stringify(value).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#152936}canvas{display:block;width:100%;height:100%;touch-action:pan-y}</style></head><body><canvas aria-label="Interactive illustrated world"></canvas><script>
const token=${literal(token)};
const canvas=document.querySelector('canvas');
const workerUrl=URL.createObjectURL(new Blob([${literal(worker)}],{type:'text/javascript'}));
let worker,loaded=false,stopped=false,waiting=false,timer,timeout,reported=false;
let world=${JSON.stringify(world).replace(/</g, "\\u003c")};
const pointer={x:600,y:540,down:false,active:false,clicks:0};
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const start=performance.now();
const report=(status,error)=>parent.postMessage({grimoire:token,status,error},'*');
function stop(){stopped=true;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();URL.revokeObjectURL(workerUrl)}
function fail(error){stop();report('error',String(error).slice(0,500))}
function frame(){
 if(stopped||waiting||!loaded)return;
 if(document.hidden&&reported){timer=setTimeout(frame,250);return}
 waiting=true;
 worker.postMessage({frame:true,width:Math.max(1,Math.round(innerWidth*Math.min(devicePixelRatio,2))),height:Math.max(1,Math.round(innerHeight*Math.min(devicePixelRatio,2))),time:motion.matches?0:(performance.now()-start)/1000,pointer,world});
 timeout=setTimeout(()=>fail('The scene took too long to draw.'),2000);
}
try{
 worker=new Worker(workerUrl);
 worker.onmessage=({data})=>{clearTimeout(timeout);waiting=false;if(data.loaded){loaded=true;frame();return}if(data.error){fail(data.error);return}if(data.bitmap){canvas.width=data.bitmap.width;canvas.height=data.bitmap.height;canvas.getContext('bitmaprenderer').transferFromImageBitmap(data.bitmap)}if(!reported){reported=true;report('ready')}if(!motion.matches)timer=setTimeout(frame,33)};
 worker.onerror=(event)=>{event.preventDefault();fail(event.message||'The scene could not draw.')};
 worker.postMessage({artworks:${JSON.stringify(artworks).replace(/</g, "\\u003c")}});timeout=setTimeout(()=>fail('The artwork could not be loaded.'),10000);
}catch(error){fail(error)}
function point(e){const scale=Math.max(innerWidth/1200,innerHeight/760);pointer.x=(e.clientX-(innerWidth-1200*scale)/2)/scale;pointer.y=(e.clientY-(innerHeight-760*scale)/2)/scale;pointer.active=true;if(motion.matches)frame()}
canvas.addEventListener('pointermove',point);
canvas.addEventListener('pointerdown',e=>{pointer.down=true;pointer.clicks++;point(e)});
canvas.addEventListener('pointerup',()=>{pointer.down=false;if(motion.matches)frame()});
canvas.addEventListener('pointercancel',()=>{pointer.down=false;pointer.active=false});
canvas.addEventListener('pointerleave',()=>{pointer.active=false;pointer.down=false});
addEventListener('message',event=>{if(event.source!==parent||event.data?.token!==token)return;world=event.data.world;if(!waiting)frame()});
addEventListener('resize',()=>frame());addEventListener('visibilitychange',()=>frame());motion.addEventListener('change',()=>frame());addEventListener('pagehide',stop);
</script></body></html>`;
}
