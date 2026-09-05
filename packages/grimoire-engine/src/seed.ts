/** The opening garden uses exactly the same editable program format as every wish. */
export const INITIAL_CODE = `
const {ellipse:e,path,group,glow,gradient,scatter,leaf,bloom}=art;
const phase=art.world?.phase??2,night=phase>=2;
const sky=phase===0?['#506b76','#cbb28c','#486b64']:phase===1?['#72958d','#c7d1ab','#486d60']:['#111a35','#34465a','#122932'];
ctx.fillStyle=gradient(0,0,0,760,[[0,sky[0]],[.55,sky[1]],[1,sky[2]]]);ctx.fillRect(0,0,1200,760);
if(night){art.stars(85,21,1200,380,'#d3d5be77');glow(875,225,150,'#d8d8b325');e(875,225,30,30,'#e1e0c6');e(887,213,28,28,'#1a2540');}
else{glow(875,225,180,'#f8df9366');e(875,225,32,32,'#f2dfad');}
path('M0 420Q170 230 350 360Q500 250 650 355Q880 200 1200 345V760H0Z','#253d48');
path('M0 490Q210 350 480 440Q750 320 1200 410V760H0Z','#304f4c');
path('M0 555Q260 425 520 495Q800 420 1200 505V760H0Z',gradient(0,430,0,760,[[0,'#36554a'],[1,'#102630']]));
path('M843 412Q750 480 822 514Q875 548 734 585Q670 625 828 760H619Q595 637 687 582Q794 537 770 514Q723 456 843 412Z',gradient(700,400,700,760,[[0,'#60999c'],[1,'#254857']]));
for(let i=0;i<10;i++){const y=466+i*27;const x=790+Math.sin(i*.8)*40-i*9;art.line([[x+Math.sin(time+i)*6,y],[x+25+Math.sin(time+i)*6,y]],'#b8ded333',1)}
path('M530 499Q421 555 517 601Q560 636 404 760',null,'#b0a07833',38);
// A crooked cottage, warmed by a single window.
group(530,378,-.04,1,()=>{
path('M-70 72L0 5L82 65V147L-65 137Z','#627667');path('M0 5L82 65V147L39 143V64Z','#455c53');
path('M-91 77L-4 -12L102 73L91 86L-3 11L-79 90Z','#182d38');
path('M-89 77L-4 -12L100 73',null,'#9aab86',3);
path('M48 21V-17H64V35','#536a61');
path('M-18 141V104A17 17 0 0 1 16 104V144Z','#203e3e');
e(-44,90,11,16,'#eccd85');art.line([[-44,76],[-44,104]],'#657464',2);art.line([[-54,90],[-34,90]],'#657464',2);glow(-44,90,48,'#ffcf6530');
});
// Branches and foliage have their own silhouettes, not tiled rows.
path('M289 646Q328 523 275 415Q239 330 266 220',null,'#577465',25);
path('M284 439Q196 391 178 281M286 391Q362 332 409 251M267 319Q216 250 243 168',null,'#577465',16);
scatter(36,81,(r,i)=>{const a=r()*Math.PI*2;const radius=Math.sqrt(r());const x=282+Math.cos(a)*155*radius,y=252+Math.sin(a)*116*radius;e(x,y,32+r()*35,23+r()*26,['#345f54','#416e5b','#4b7660'][i%3])});
scatter(90,87,(r,i)=>{const a=r()*Math.PI*2,rad=Math.sqrt(r());const x=280+Math.cos(a)*145*rad,y=248+Math.sin(a)*103*rad;if(i%3===0)bloom(x,y,2+r()*2,'#b4a4dc');else leaf(x,y,4+r()*4,r()*6,'#8caa753b')});
scatter(65,55,(r,i)=>{const x=r()*1200,y=530+r()*210;leaf(x,y,6+r()*6,-.7+r()*1.4,'#73987b55')});
for(let i=0;i<7;i++){const x=340+i*76,y=613+Math.sin(i*4)*45;const sway=Math.sin(time*.7+i)*3;path('M'+x+' '+(y+25)+'Q'+(x-8)+' '+(y+6)+' '+(x+sway)+' '+y,null,'#8eaf84',2);glow(x+sway,y,20,'#ccb9f32a');bloom(x+sway,y,5,'#c8afe8')}
for(let i=0;i<12;i++){const x=220+(i*83)%760+Math.sin(time*.4+i)*15,y=380+(i*43)%280+Math.cos(time*.6+i)*12;glow(x,y,17,'#d9e9a72a');e(x,y,1.4,1.4,'#e5edb7')}
// A moth follows a nearby hand. All interaction is ordinary generated code.
const mx=pointer.active?675+(pointer.x-675)*.22:675+Math.sin(time*.5)*22;
const my=pointer.active?455+(pointer.y-455)*.2:455+Math.sin(time*.8)*10;
group(mx,my,Math.sin(time*.5)*.1,1,()=>{glow(0,0,45,'#e5d7a921');const wing=13+Math.sin(time*3)*3;e(-15,-4,wing,10,'#e2d4af',.6);e(15,-4,wing,10,'#e2d4af',-.6);e(-8,10,6,10,'#c7c59d',.5);e(8,10,6,10,'#c7c59d',-.5);e(0,2,3,14,'#a79678')});
if(pointer.active){glow(pointer.x,pointer.y,55,'#ead5a51a');for(let i=0;i<7;i++){const a=i*.9+time*.5;e(pointer.x+Math.cos(a)*24,pointer.y+Math.sin(a)*15,1.3,1.3,'#e8d8aa')}}
// Ferns frame the little world; river stones and silver trails give it scale.
scatter(24,311,(r,i)=>{const x=90+r()*1030,y=650+r()*100,h=16+r()*35;art.line([[x,y],[x+5,y-h]],'#6e987c66',1);for(let k=0;k<5;k++){const yy=y-k*h/5;leaf(x-3,yy,5+k*.7,-1.1,'#70957b88');leaf(x+7,yy-3,5+k*.7,1.1,'#91ab8277');}});
scatter(19,322,(r,i)=>{const y=545+r()*135,x=725+Math.sin(y*.025)*50;e(x,y,3+r()*7,2+r()*3,'#829b8c88');});
art.grain(2200,17,'#e8efce0b');

// Every resident belongs to the persistent garden. Bodies follow their actual homes.
const living=art.world;
if(living?.habitats){
 for(const patch of living.habitats){
  art.glow(patch.x,patch.y,80,'#80c79016');
  if(patch.shelter>.75){art.path('M'+(patch.x-44)+' '+(patch.y+2)+'q44 -62 88 0',null,'#82a58a',5);for(let k=0;k<7;k++)art.leaf(patch.x-36+k*12,patch.y-6-Math.sin(k/6*Math.PI)*28,12,k*.15,'#668b6e');}
  for(let k=0;k<Math.round(patch.bloom*10);k++){const x=patch.x+Math.sin(k*2.4)*60,y=patch.y+Math.cos(k*2.4)*24;art.bloom(x,y,4+patch.bloom*3,'#d8b0e3',5);if(living.phase===3)art.glow(x,y,16,'#e4c6ef38');}
 }
 for(const resident of living.residents){
  const near=pointer.active?Math.max(0,1-Math.hypot(pointer.x-resident.x,pointer.y-resident.y)/160):0;
  memory.residents??={};const position=memory.residents[resident.id]??={x:resident.x,y:resident.y,at:time};
  const dt=Math.max(0,Math.min(.1,time-position.at));position.at=time;
  const ease=dt?1-Math.exp(-dt*2):1;position.x+=(resident.x-position.x)*ease;position.y+=(resident.y-position.y)*ease;
  if(resident.id==='sol'&&Math.hypot(position.x-resident.x,position.y-resident.y)>4)art.line([[position.x,position.y+5],[position.x-35,position.y+10]],'#dedebb55',1);
  art.group(position.x,position.y,0,1,()=>{
   if(resident.id==='sol'){
    art.glow(0,-9,35+near*16,'#f3d69e45');art.ellipse(0,5,27,8,'#b6c0a0');
    art.ellipse(-8,-10,19,21,'#d7b885');art.path('M-8 -21c-16 0 -17 24 -2 25c11 0 11 -15 2 -15c-5 0 -5 7 0 7',null,'#9a876b',2);
    art.line([[19,3],[24,-12-near*5]],'#b9cba7',2);art.line([[13,2],[13,-14-near*5]],'#b9cba7',2);art.ellipse(24,-12-near*5,2,2,'#1c3e3a');art.ellipse(13,-14-near*5,2,2,'#1c3e3a');
   }else if(resident.id==='pip'){
    art.ellipse(0,-8+Math.sin(time*1.8)*1.5,16,20,'#99876d',-.15);art.ellipse(7,-9,10,13,'#d39b7c');art.ellipse(7,-25,11,10,'#a99578');art.ellipse(11,-28,2,2,'#273e37');art.path('M16 -25l12 3 -12 4Z','#d9bc83');art.path('M-8 -4l-22 11 14 -24Z','#797f65');
   }
   if(near>.2){art.glow(0,-5,45,'#ffead624');for(let k=0;k<3;k++)art.ellipse(Math.sin(time+k*2)*24,-35-k*7-near*8,1.3,1.3,'#e8d9ab');}
  });
 }
 for(const discovery of living.discoveries){glow(discovery.x-20,discovery.y+14,25,'#f7d69433');path('M'+(discovery.x-24)+' '+(discovery.y+14)+'l4 -5 4 5 -4 5Z','#e6ce95');}
 if(living.weather==='soft rain')for(let k=0;k<70;k++){const x=(k*137)%1200,y=(k*83+time*85)%760;art.line([[x,y],[x-3,y+12]],'#bed7d833',1);}
}
`;
