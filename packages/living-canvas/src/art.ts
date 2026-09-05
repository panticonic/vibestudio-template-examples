/** Plain source shared by the renderer and the agent's documentation. No object vocabulary. */
export const ART_LIBRARY = `function makeArt(ctx) {
 const TAU=Math.PI*2;
 const ellipse=(x,y,rx,ry,color,angle=0)=>{ctx.beginPath();ctx.ellipse(x,y,Math.abs(rx),Math.abs(ry),angle,0,TAU);ctx.fillStyle=color;ctx.fill()};
 const path=(d,fill,stroke,width=1)=>{const p=new Path2D(d);if(fill){ctx.fillStyle=fill;ctx.fill(p)}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke(p)}};
 const line=(points,color,width=1)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke()};
 const group=(x,y,rotation,scale,draw)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);try{draw()}finally{ctx.restore()}};
 const glow=(x,y,r,color)=>{ctx.save();ctx.globalCompositeOperation='screen';const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ellipse(x,y,r,r,g);ctx.restore()};
 const gradient=(x1,y1,x2,y2,stops)=>{const g=ctx.createLinearGradient(x1,y1,x2,y2);stops.forEach(([p,c])=>g.addColorStop(p,c));return g};
 const random=(seed)=>{let n=seed|0;return ()=>{n=(Math.imul(n,1664525)+1013904223)|0;return (n>>>0)/4294967296}};
 const scatter=(count,seed,draw)=>{const rnd=random(seed);for(let i=0;i<count;i++)draw(rnd,i)};
 const leaf=(x,y,size,angle,color)=>group(x,y,angle,size,()=>path('M0 0Q-1 -1 0 -2Q1 -1 0 0Z',color));
 const petal=(x,y,size,angle,color)=>group(x,y,angle,size,()=>path('M0 0C-1 -1 -0.5 -2 0 -2C0.5 -2 1 -1 0 0Z',color));
 const bloom=(x,y,size,color,petals=5)=>{for(let i=0;i<petals;i++)petal(x,y,size,i*TAU/petals,color);ellipse(x,y,size*.3,size*.3,'#ffe7ae')};
 const ribbon=(points,width,color)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i+2<points.length;i+=3)ctx.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke()};
 const stars=(count,seed,width,height,color)=>scatter(count,seed,(r)=>ellipse(r()*width,r()*height,.5+r()*1.1,.5+r()*1.1,color));
 const grain=(count,seed,color)=>scatter(count,seed,(r)=>{ctx.fillStyle=color;ctx.fillRect(r()*1200,r()*760,1,1)});
 return {ellipse,path,line,group,glow,gradient,random,scatter,leaf,petal,bloom,ribbon,stars,grain,
 mix:(a,b,t)=>a+(b-a)*t,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
 wave:(t,speed=1,phase=0)=>Math.sin(t*speed+phase),
 distance:(x,y,p)=>Math.hypot(x-p.x,y-p.y),
 palette:{ink:'#10212c',mist:'#adc9bc',gold:'#ecd39b',rose:'#e8a0b2',lilac:'#b6a5e7',moss:'#527866',water:'#578c98'}};
}`;
export const ART_GUIDE = `Generated images: call make_image sparingly for memorable portraits, a new place, or a discovered artifact. Reuse prior images as references to preserve identity and style. Return their ids in scene.assets; draw with art.image(id,x,y,width,height), or use art.images[id] with ctx.drawImage. Never regenerate an image for ordinary conversation. Code supplies motion and touch reactions over or around the art.\nOptional art helpers (all positions in 1200x760 units, angles in radians):
art.ellipse(x,y,rx,ry,color,angle=0); art.path(svgPathString,fill,stroke?,lineWidth=1); art.line([[x,y],...],color,width=1);
art.group(x,y,rotation,scale,()=>drawLocalShapes()); art.glow(x,y,radius,color); art.gradient(x1,y1,x2,y2,[[0,color],[1,color]]);
art.random(seed) returns a deterministic random function; art.scatter(count,seed,(random,index)=>draw()); art.stars(count,seed,width,height,color); art.grain(count,seed,color);
art.leaf(x,y,size,angle,color); art.petal(x,y,size,angle,color); art.bloom(x,y,size,color,petals=5); art.ribbon([start,control1,control2,end,...],width,color);
art.mix(a,b,t); art.clamp(value,min,max); art.wave(time,speed=1,phase=0); art.distance(x,y,pointer);
art.palette: ink,mist,gold,rose,lilac,moss,water. Every helper is optional. Canvas paths, gradients, transforms, compositing, your own procedural geometry and interactions are encouraged. The library has no creature registry and does not define what this world can contain.`;
