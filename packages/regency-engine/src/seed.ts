/** The opening realm is ordinary editable scene code, just like every later view. */
export const INITIAL_CODE = `
const {ellipse:e,path,gradient,group,scatter}=art;
ctx.fillStyle=gradient(0,0,0,760,[[0,'#d9e3d9'],[.38,'#f2e8c9'],[1,'#849f82']]);ctx.fillRect(0,0,1200,760);
art.glow(920,128,230,'#fff0cb77');e(920,128,32,32,'#fff0c8');
path('M0 310Q120 208 248 295Q385 166 516 293Q687 153 808 280Q1000 162 1200 292V760H0Z','#b3c6bb');
path('M0 366Q173 248 338 355Q506 218 710 346Q916 219 1200 326V760H0Z','#9cb6a4');
path('M0 442Q220 302 460 403Q701 282 911 384Q1051 329 1200 377V760H0Z','#8da98b');
path('M0 590Q228 388 514 464Q847 358 1200 438V760H0Z',gradient(0,390,0,760,[[0,'#b6bd8b'],[1,'#8fa079']]));
// The river joins distant trade to the port, then opens toward the sea.
const river='M750 303Q668 358 728 410Q805 455 699 506Q637 546 765 616Q827 669 916 760H550Q682 662 600 605Q529 540 650 483Q729 443 685 410Q635 349 750 303Z';
path(river,'#7da9a8');
path('M750 304Q658 359 715 414Q779 454 676 500Q606 548 703 615Q805 694 764 760',null,'#a7c6b2',3);
// Terraced fields remain divided by hedges and access lanes.
for(let j=0;j<5;j++)for(let i=0;i<4;i++)group(803+i*48-j*12,416+j*32,0,1,()=>{
 path('M0 0l42 -9 28 22 -44 11Z',['#cec18c','#b1b27b','#d9c798','#aab880'][(i+j)%4], '#87966d',1);
 for(let k=1;k<5;k++)art.line([[k*8,k*-1.7+3],[k*8+20,k*-1.7+20]],'#f3ddab55',1);
});
path('M478 375Q426 390 436 452Q455 489 532 521L597 528',null,'#e0cf9f',9);
path('M476 376Q439 334 462 292L506 242',null,'#d2c89d',5);
path('M731 464Q817 482 912 514',null,'#e0cf9f',7);
const tree=(x,y,s,tone)=>group(x,y,0,s,()=>{e(4,4,13,5,'#405d4e22');art.line([[0,0],[0,-29]],'#677454',2);path('M-15 -13Q-23 -29 -9 -37Q-11 -53 2 -57Q16 -52 14 -38Q29 -20 13 -14Z',tone);path('M2 -49Q-3 -29 4 -13',null,'#c4ce9b33',2)});
scatter(155,49,r=>{const x=260+r()*370,y=267+r()*126;if(Math.abs(x-(500-(y-265)*.25))<25)return;tree(x,y,.42+r()*.35,['#6c8f78','#78987a','#829f81'][Math.floor(r()*3)])});
const house=(x,y,s,roof='#9f765e')=>group(x,y,0,s,()=>{e(5,17,25,7,'#53674822');path('M-20 -6L4 -28L29 -7V24L-20 17Z','#e5d4ac');path('M4 -28L29 -7V24L7 17V-4Z','#b9b08b');path('M-26 -7L2 -34L36 -8L29 -2L2 -24L-19 -2Z',roof);path('M-3 19V7h8v14Z','#73806b');e(-12,2,3,4,'#f5e4ad');art.line([[17,-18],[17,-33]],'#ad9776',5)});
// The crown is one institution in a much larger landscape.
group(483,350,0,.76,()=>{
 e(2,57,99,26,'#4f6d5128');path('M-76 11L41 -3L80 17V75L-76 59Z','#c9c5a0');path('M41 -3L80 17V75L41 57Z','#a5b098');
 for(const x of [-78,32]){path('M'+x+' -25h36v85h-36Z','#e2dbb6');path('M'+(x-6)+' -25l24 -39 25 39Z','#607f77');for(let j=0;j<3;j++)path('M'+(x+13)+' '+(-6+j*20)+'h8v12h-8Z','#809685');}
 path('M-28 63V38a14 14 0 0 1 28 0v29Z','#627b68');art.line([[50,-61],[50,-91]],'#7d8f73',2);path('M50 -91q20 -4 35 6l-35 10Z','#bd8665');
});
house(404,419,.48);house(453,438,.52);house(504,444,.44);house(864,474,.47);house(902,495,.56);house(832,503,.4);
// Flood-damaged crossing: two surviving approaches, a visible break.
path('M666 466L691 472M728 480L762 487',null,'#c9bc97',13);
path('M666 459L689 466M731 474L762 480',null,'#eee0b5',2);
for(const x of [670,751])art.line([[x,471+(x-670)*.19],[x,490+(x-670)*.19]],'#7e8d73',5);
path('M697 488l11 5M718 494l8 -3',null,'#b9a981',3);
// River port: warehouses, cranes and boats waiting on the quay.
path('M493 553L583 531L622 561L532 586Z','#c9b78e');
for(let i=0;i<4;i++){house(492+i*25,541-i*6,.49,'#8c7661');art.line([[534+i*18,570-i*4],[540+i*18,590-i*4]],'#9e9777',3)}
art.line([[575,543],[575,506],[594,507],[590,529]],'#8e8a6a',3);
const boat=(x,y,s,angle=0)=>group(x,y,angle,s,()=>{e(3,12,34,8,'#486d6c22');path('M-33 0Q0 20 34 0L24 15Q0 29 -25 14Z','#8b7d60');art.line([[0,8],[0,-37]],'#847f63',2);path('M3 -35v38h24Z','#f4dfad');path('M-3 -33v32h-17Z','#d6c797')});
boat(650+Math.sin(time*.17)*9,587+Math.cos(time*.17)*5,.65,.15);
boat(744+Math.sin(time*.1)*17,679,.74,-.12);
boat(711,417+Math.sin(time*.15)*9,.28,.2);
scatter(72,17,r=>{const x=180+r()*850,y=451+r()*270;if((x>555&&x<820)||(x>780&&y<540))return;tree(x,y,.45+r()*.45,['#809776','#8da17c','#9dac80'][Math.floor(r()*3)])});
for(let i=0;i<17;i++){const y=425+i*18,x=700+Math.cos(i*.64)*29+(i>9?(i-9)*9:0);art.line([[x+Math.sin(time*.7+i)*3,y],[x+15+Math.sin(time*.7+i)*3,y]],'#deebcc55',1)}
for(let i=0;i<5;i++){const x=595+i*40+Math.sin(time*.2+i)*9,y=235+Math.sin(i*3+time*.3)*13;path('M'+(x-4)+' '+y+'q3 -4 5 0q3 -4 5 0',null,'#738c7c',1)}
if(pointer.active)art.glow(pointer.x,pointer.y,40,'#fff2c220');
art.grain(4500,71,'#3653430b');

const realm=art.world;
if(realm?.economy){
 const economy=realm.economy,bridge=economy.routes.find(r=>r.id==='east-crossing'),ferry=economy.routes.find(r=>r.id==='east-ferry');
 if(bridge?.condition>.9){art.path('M665 463L763 482',null,'#d7c9a3',13);art.path('M665 455L763 474',null,'#f5e6bc',3);}
 if(bridge?.workers){for(let k=0;k<Math.min(bridge.workers,8);k++){const x=655+k*8;art.ellipse(x,457,2,3,'#c89670');art.line([[x,460],[x+Math.sin(time*2+k)*2,468]],'#506e65',3);}art.path('M663 448v-34h29v47',null,'#9a8b63',2);}
 if(ferry?.subsidy>0){const x=682+Math.sin(time*.12)*33;boat(x,515+Math.sin(time*.12)*6,.56);art.glow(x,516,38,'#f8e6aa20');}
 for(const flow of economy.flows){if(flow.amount<=0)continue;const route=economy.routes.find(r=>r.id===flow.route),a=economy.regions.find(r=>r.id===route.from),b=economy.regions.find(r=>r.id===route.to);if(!a||!b)continue;
  const count=Math.min(5,Math.ceil(flow.amount/4));for(let k=0;k<count;k++){const t=(time*.025+k/count)%1,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t+Math.sin(t*Math.PI)*30;art.ellipse(x,y,3,2,'#ead3a077');}
 }
 for(const region of economy.regions){if(region.confidence>65)art.glow(region.x,region.y,55,'#f7dda322');if(region.grain<region.consumption*.5){art.path('M'+(region.x-10)+' '+(region.y+25)+'h20',null,'#a9765b',2);}}
 if(realm.month%12>=9){ctx.fillStyle='#a8c5cb24';ctx.fillRect(0,0,1200,760);}else if(realm.month%12>=6){ctx.fillStyle='#dfb56c19';ctx.fillRect(0,0,1200,760);}
}
`;
