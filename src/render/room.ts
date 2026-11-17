import type { Report } from "../schema.js";

/**
 * 3D view of one rehearsal, drawn on a canvas with no dependencies. Every element maps to the
 * report: quotes sit on the outer shell (coloured by source domain), personas sit inside (sized by
 * audience share, coloured and raised by stance), and lines link each persona to the quotes it
 * cites. Rounds animate stance changes; from round 2 the personas see each other's reactions.
 *
 * `window.greenroomRoom.draw(state)` renders one exact frame, so a recorder can capture it
 * frame by frame. The page drives it with time, drag and the round buttons.
 */
export function roomSection(r: Report): string {
  if (!r.personas.length || !r.reactions.length || !r.stats.rounds) return "";
  return `<h2>Personas and the quotes behind them</h2>
<div class="card room">
<div class="room-bar"><div class="room-rounds" role="group" aria-label="Round">${Array.from({ length: r.stats.rounds }, (_, i) => `<button class="btn sm" type="button" data-round="${i + 1}">Round ${i + 1}</button>`).join("")}</div><button class="btn sm" type="button" id="room-play">Pause</button></div>
<div class="room-stage"><canvas id="room" role="img" aria-label="${r.personas.length} personas linked to the ${r.evidence.length} quotes they cite, coloured by stance in each of ${r.stats.rounds} rounds"></canvas><div class="room-tip" id="room-tip" hidden></div></div>
<p class="legend">Outer points are quotes, coloured by source. Inner spheres are personas, sized by audience share, coloured and raised by stance. Lines link each persona to the quotes it cites. Drag to turn.</p>
</div>`;
}

export const ROOM_CSS: string = `
.room{padding:16px}
.room-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.room-rounds{display:flex;gap:8px;flex-wrap:wrap}
.btn.sm{padding:6px 16px;font-size:14px}
.btn.sm.on{background:var(--blue-600);border-color:var(--blue-600)}
.room-stage{position:relative}
#room{display:block;width:100%;height:540px;cursor:grab;touch-action:none}
#room.drag{cursor:grabbing}
.room-tip{position:absolute;max-width:360px;padding:12px 16px;border-radius:var(--r-md);background:var(--blue-800);border:1px solid var(--blue-700);box-shadow:var(--shadow-md);font-size:14px;line-height:1.5;pointer-events:none;color:var(--w100)}
.room-tip small{display:block;color:var(--gray-400);margin-top:4px}
.room .legend{margin-top:8px}
@media (max-width:640px){#room{height:460px}}
@media print{.room-bar{display:none}}
`;

// Plain JS in a string: no template interpolation and no backslashes inside.
export const ROOM_JS: string = `
(function(){
var cv=document.getElementById('room');if(!cv)return;
var R=JSON.parse(document.getElementById('report-data').textContent);
var ctx=cv.getContext('2d');
var ROUNDS=R.stats.rounds;
var DOM_COLORS=['#3D7FFC','#9FC0FF','#F5F8FF','#8599AC','#76A5FF','#C6DBFF'];
var domains=[];R.evidence.forEach(function(e){if(domains.indexOf(e.domain)<0)domains.push(e.domain)});
var counts={};R.evidence.forEach(function(e){counts[e.domain]=(counts[e.domain]||0)+1});
domains.sort(function(a,b){return counts[b]-counts[a]});
var quotes=R.evidence.slice().sort(function(a,b){return domains.indexOf(a.domain)-domains.indexOf(b.domain)});
var N=quotes.length,GA=Math.PI*(3-Math.sqrt(5));
var qById={};
quotes.forEach(function(q,i){var y=N>1?1-2*(i+0.5)/N:0;var rr=Math.sqrt(1-y*y);var a=i*GA;
  qById[q.id]={q:q,p:[Math.cos(a)*rr,y*0.92,Math.sin(a)*rr],c:DOM_COLORS[domains.indexOf(q.domain)%DOM_COLORS.length]}});
var P=R.personas.length;
var people=R.personas.map(function(p,i){var a=i/P*Math.PI*2;var st=[];for(var k=1;k<=ROUNDS;k++){var x=R.reactions.find(function(z){return z.personaId===p.id&&z.round===k});st.push(x?{s:x.stance,a:x.action,e:x.evidenceIds||[]}:{s:0,a:'',e:[]})}
  return {p:p,ang:a,rad:0.05+Math.sqrt(p.weight)*0.15,st:st,links:(p.evidenceIds||[]).filter(function(id){return qById[id]})}});
var STOPS=[[-2,[200,24,122]],[-1,[235,55,140]],[0,[133,153,172]],[1,[118,165,255]],[2,[61,127,252]]];
function stanceRGB(s){s=Math.max(-2,Math.min(2,s));for(var i=0;i<4;i++){var a=STOPS[i],b=STOPS[i+1];if(s<=b[0]){var t=(s-a[0])/(b[0]-a[0]);return [0,1,2].map(function(k){return Math.round(a[1][k]+(b[1][k]-a[1][k])*t)})}}return STOPS[4][1]}
function rgba(c,a){return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'}
function hexRGB(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]}
function ease(t){t=Math.max(0,Math.min(1,t));return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function at(arr,round,f){var i=Math.floor(round)-1,j=Math.min(arr.length-1,i+1);i=Math.max(0,Math.min(arr.length-1,i));var t=ease(round-Math.floor(round));return f(arr[i])+(f(arr[j])-f(arr[i]))*t}
function personPos(m,round){var s=at(m.st,round,function(x){return x.s});return [Math.cos(m.ang)*0.68,s*0.15,Math.sin(m.ang)*0.68]}
var W=0,H=0,DPR=1;
function size(w,h,dpr){DPR=dpr||window.devicePixelRatio||1;W=w;H=h;cv.width=Math.round(w*DPR);cv.height=Math.round(h*DPR)}
function project(p,S){var cy=Math.cos(S.yaw),sy=Math.sin(S.yaw),cp=Math.cos(S.pitch),sp=Math.sin(S.pitch);
  var x=p[0]*cy-p[2]*sy,z=p[0]*sy+p[2]*cy;var y=p[1]*cp-z*sp;z=p[1]*sp+z*cp;
  var D=3.1,f=Math.min(W*(W<560?0.92:0.6),H)*1.3*(S.zoom||1),k=f/(D-z);return {x:W/2+(S.panX||0)*W+x*k,y:H/2+(S.panY==null?(W<560?-0.12:0):S.panY)*H-y*k,z:z,k:k}}
var hits=[];
function draw(S){
  S=S||{};var round=S.round==null?ROUNDS:S.round,build=S.build==null?1:S.build,edges=S.edges==null?1:S.edges,talk=S.talk==null?(round>1.5?1:0):S.talk,ls=S.labelScale||(W<560?0.8:1),ps=S.pointScale||ls;
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);
  var bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.6);bg.addColorStop(0,'#0C2550');bg.addColorStop(1,'#091B36');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  hits=[];var focus=S.focus||null,fq=S.focusQuotes||null;
  function circle(rad,y,al,dash){var pts=[];for(var i=0;i<=72;i++){var a=i/72*Math.PI*2;pts.push(project([Math.cos(a)*rad,y,Math.sin(a)*rad],S))}ctx.strokeStyle='rgba(198,219,255,'+al+')';ctx.lineWidth=ls;ctx.setLineDash(dash?[2*ls,6*ls]:[]);ctx.beginPath();pts.forEach(function(p,i){i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.stroke();ctx.setLineDash([])}
  [-0.6,-0.3,0,0.3,0.6].forEach(function(y){circle(Math.sqrt(1-y*y/0.8464)*1.0,y,0.05*build,false)});circle(0.68,0,0.14,true);
  var pp=people.map(function(m){return project(personPos(m,round),S)});
  var qp={};Object.keys(qById).forEach(function(id){qp[id]=project(qById[id].p,S)});
  var cur=Math.max(1,Math.min(ROUNDS,Math.round(round)));
  // persona-to-persona: what each one hears from round 2
  if(talk>0){var ph=S.talkPhase==null?0:S.talkPhase;var n=0;
    for(var a1=0;a1<P;a1++)for(var b1=a1+1;b1<P;b1++){var A=pp[a1],B=pp[b1];n++;
      ctx.strokeStyle='rgba(198,219,255,'+(0.09*talk)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
      var t=(ph*0.6+n*0.137)%1;var dir=n%2?t:1-t;var x=A.x+(B.x-A.x)*dir,y=A.y+(B.y-A.y)*dir;
      ctx.fillStyle='rgba(245,248,255,'+(0.75*talk*Math.sin(Math.PI*t))+')';ctx.beginPath();ctx.arc(x,y,2.6*ps,0,Math.PI*2);ctx.fill()}}
  // persona-to-quote links, grown in order
  var total=0;people.forEach(function(m){total+=m.links.length});var idx=0;
  people.forEach(function(m,pi){var A=pp[pi];var cited=m.st[cur-1].e;m.links.forEach(function(id){var g=Math.max(0,Math.min(1,edges*1.6-idx/Math.max(1,total)*0.6));idx++;if(g<=0)return;
    var Q=qp[id];var on=focus?m.p.id===focus:false;var hot=cited.indexOf(id)>=0;
    var al=focus?(on?0.95:0.05):(hot?0.5:0.2);ctx.strokeStyle=on?'rgba(241,97,166,'+al+')':'rgba(118,165,255,'+al+')';ctx.lineWidth=(on?2.4:1.1)*ps;
    ctx.beginPath();ctx.moveTo(Q.x,Q.y);ctx.lineTo(Q.x+(A.x-Q.x)*ease(g),Q.y+(A.y-Q.y)*ease(g));ctx.stroke()})});
  // spheres and quote points, back to front
  var items=[],labels=[];
  quotes.forEach(function(q,i){var d=Math.max(0,Math.min(1,build*1.5-i/N*0.5));if(d<=0)return;items.push({z:qp[q.id].z,t:'q',id:q.id,d:d})});
  people.forEach(function(m,i){items.push({z:pp[i].z,t:'p',i:i})});
  items.sort(function(a,b){return a.z-b.z});
  items.forEach(function(it){
    if(it.t==='q'){var Q=qp[it.id],o=qById[it.id],dep=0.35+0.65*(Q.z+1)/2;var on=fq?fq.indexOf(it.id)>=0:false;var dim=(focus||fq)&&!on?0.35:1;
      var rr=(on?5.5:4.2)*ps*Q.k/220*ease(it.d);var c=hexRGB(o.c);
      if(on){ctx.fillStyle='rgba(241,97,166,0.25)';ctx.beginPath();ctx.arc(Q.x,Q.y,rr*1.9,0,Math.PI*2);ctx.fill()}
      ctx.fillStyle=rgba(on?[241,97,166]:c,dep*dim*ease(it.d));ctx.beginPath();ctx.arc(Q.x,Q.y,Math.max(0.5,rr),0,Math.PI*2);ctx.fill();
      hits.push({x:Q.x,y:Q.y,r:Math.max(8,rr*2),kind:'q',o:o.q})}
    else{var m=people[it.i],A=pp[it.i];var s=at(m.st,round,function(x){return x.s});var c=stanceRGB(s);var pop=S.people==null?1:ease(Math.max(0,Math.min(1,S.people*1.6-it.i/P*0.6)));if(pop<=0)return;var rr=m.rad*A.k*pop;var dim=focus&&m.p.id!==focus?0.4:1;
      ctx.globalAlpha=dim*pop;
      var glow=ctx.createRadialGradient(A.x,A.y,rr*0.6,A.x,A.y,rr*2.2);glow.addColorStop(0,rgba(c,0.35));glow.addColorStop(1,rgba(c,0));ctx.fillStyle=glow;ctx.beginPath();ctx.arc(A.x,A.y,rr*2.2,0,Math.PI*2);ctx.fill();
      var g=ctx.createRadialGradient(A.x-rr*0.35,A.y-rr*0.4,rr*0.1,A.x,A.y,rr);g.addColorStop(0,rgba([Math.min(255,c[0]+90),Math.min(255,c[1]+90),Math.min(255,c[2]+90)],1));g.addColorStop(0.55,rgba(c,1));g.addColorStop(1,rgba([c[0]*0.45|0,c[1]*0.45|0,c[2]*0.45|0],1));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(A.x,A.y,rr,0,Math.PI*2);ctx.fill();
      if(focus===m.p.id){ctx.strokeStyle='#F161A6';ctx.lineWidth=3*ls;ctx.beginPath();ctx.arc(A.x,A.y,rr+6*ls,0,Math.PI*2);ctx.stroke()}
      labels.push({m:m,A:A,rr:rr,s:s,dim:dim*pop});
      var fr=round-Math.floor(round);if(fr>0.02&&fr<0.98){var i0=Math.floor(round)-1;var a0=m.st[i0],a1=m.st[Math.min(ROUNDS-1,i0+1)];if(a0.s!==a1.s||a0.a!==a1.a){ctx.strokeStyle='rgba(241,97,166,'+(Math.sin(Math.PI*fr)*0.9)+')';ctx.lineWidth=2.5*ls;ctx.beginPath();ctx.arc(A.x,A.y,rr+(6+14*fr)*ls,0,Math.PI*2);ctx.stroke()}}
      ctx.globalAlpha=1;hits.push({x:A.x,y:A.y,r:Math.max(10,rr),kind:'p',m:m,s:s,cur:cur})}
  });
  labels.forEach(function(L){
    if(S.labels!==false){ctx.globalAlpha=L.dim;ctx.shadowColor='rgba(9,27,54,0.9)';ctx.shadowBlur=6*ls;var act=L.m.st[cur-1].a.replace('_',' ');
        ctx.textAlign='center';ctx.font='500 '+(14*ls)+'px Gibson,Inter,Segoe UI,system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.95)';ctx.fillText(L.m.p.name,L.A.x,L.A.y+L.rr+18*ls);
        var moved=L.m.st[0].a!==L.m.st[cur-1].a||L.m.st[0].s!==L.m.st[cur-1].s;if(S.labels==='full'||(S.labels==='movers'&&moved&&cur>1)||focus===L.m.p.id){ctx.font='300 '+(12*ls)+'px Gibson,Inter,Segoe UI,system-ui,sans-serif';ctx.fillStyle=rgba(L.s<-0.5?[241,97,166]:L.s>0.5?[159,192,255]:[184,196,208],0.95);ctx.fillText(act,L.A.x,L.A.y+L.rr+34*ls)}}
    ctx.shadowBlur=0;ctx.globalAlpha=1});
  if(S.callout&&qById[S.callout.id]&&S.callout.alpha>0){var co=S.callout,o=qById[co.id],Q=qp[co.id],al=ease(co.alpha);var cw=(co.w||340)*ls,cx=co.x*W,cy=co.y*H,fs=15*ls,lh=fs*1.4;
    ctx.font='300 '+fs+'px Gibson,Inter,Segoe UI,system-ui,sans-serif';var words=('"'+o.q.quote+'"').split(' '),lines=[],line='';
    words.forEach(function(w){var t=line?line+' '+w:w;if(ctx.measureText(t).width>cw-32*ls&&line){lines.push(line);line=w}else line=t});if(line)lines.push(line);if(lines.length>(co.maxLines||5)){lines=lines.slice(0,co.maxLines||5);lines[lines.length-1]=lines[lines.length-1].replace(/[,.;:]?$/,'...')}
    var ch=lines.length*lh+56*ls;ctx.globalAlpha=al;
    ctx.strokeStyle='rgba(241,97,166,0.8)';ctx.lineWidth=1.5*ls;ctx.beginPath();ctx.moveTo(Q.x,Q.y);ctx.lineTo(cx,cy+ch/2);ctx.stroke();
    ctx.fillStyle='rgba(9,35,73,0.96)';ctx.strokeStyle='#EB378C';ctx.lineWidth=2*ls;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(cx,cy,cw,ch,14*ls);else ctx.rect(cx,cy,cw,ch);ctx.fill();ctx.stroke();
    ctx.textAlign='left';ctx.fillStyle='#fff';lines.forEach(function(l,i){ctx.fillText(l,cx+16*ls,cy+22*ls+fs*0.8+i*lh)});
    ctx.font='500 '+(12*ls)+'px Gibson,Inter,Segoe UI,system-ui,sans-serif';ctx.fillStyle='#9FC0FF';ctx.fillText(o.q.id+', '+o.q.domain,cx+16*ls,cy+ch-16*ls);ctx.globalAlpha=1}
  if(S.hud!==false){var ls=S.hudScale||ls;ctx.textAlign='left';var pad=20*ls;
    ctx.font='500 '+(18*ls)+'px Gibson,Inter,Segoe UI,system-ui,sans-serif';ctx.fillStyle='#fff';ctx.fillText(S.hudTitle||('Round '+cur+' of '+ROUNDS),pad,pad+16*ls);
    ctx.font='300 '+(14*ls)+'px Gibson,Inter,Segoe UI,system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.fillText(S.hudSub||(cur===1?'Each persona reacts on its own':'Each persona has seen the others react'),pad,pad+40*ls);
    var y=H-pad;domains.slice().reverse().forEach(function(d,i){var c=DOM_COLORS[domains.indexOf(d)%DOM_COLORS.length];ctx.fillStyle=c;ctx.beginPath();ctx.arc(pad+5*ls,y-5*ls,5.5*ls,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillText(d+' ('+counts[d]+')',pad+16*ls,y);y-=20*ls});
    var narrow=W<560;ctx.textAlign=narrow?'left':'right';var x=narrow?pad:W-pad,sy=narrow?y:H-pad;var legend=[['Negative',[235,55,140]],['Neutral',[133,153,172]],['Positive',[61,127,252]]];if(!narrow)legend.reverse();legend.forEach(function(l){var w=ctx.measureText(l[0]).width;if(narrow){ctx.fillStyle=rgba(l[1],1);ctx.beginPath();ctx.arc(x+5*ls,sy-5*ls,5*ls,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillText(l[0],x+16*ls,sy);x+=w+34*ls}else{ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fillText(l[0],x,sy);ctx.fillStyle=rgba(l[1],1);ctx.beginPath();ctx.arc(x-w-10*ls,sy-4*ls,5*ls,0,Math.PI*2);ctx.fill();x-=w+34*ls}})}
}
var stopped=false;
window.greenroomRoom={draw:draw,size:size,stop:function(){stopped=true},personas:people.map(function(m){return m.p.id}),rounds:ROUNDS};
if(cv.dataset.manual)return;
// Page driver: slow turn, rounds advance on their own, drag to turn, buttons pick a round.
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var S={yaw:0.5,pitch:0.5,round:reduce?ROUNDS:1,talkPhase:0};var target=reduce?ROUNDS:1,playing=!reduce,last=0,hold=0,drag=null,hover=null;
var btns=Array.prototype.slice.call(document.querySelectorAll('[data-round]'));var play=document.getElementById('room-play');var tip=document.getElementById('room-tip');
function mark(){btns.forEach(function(b){b.classList.toggle('on',+b.dataset.round===target)});play.textContent=playing?'Pause':'Play'}
btns.forEach(function(b){b.addEventListener('click',function(){target=+b.dataset.round;playing=false;mark()})});
play.addEventListener('click',function(){playing=!playing;mark()});
function fit(){var r=cv.getBoundingClientRect();size(r.width,r.height)}
fit();window.addEventListener('resize',fit);
cv.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY,yaw:S.yaw,pitch:S.pitch};cv.classList.add('drag');cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointerup',function(){drag=null;cv.classList.remove('drag')});
cv.addEventListener('pointermove',function(e){var r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(drag){S.yaw=drag.yaw+(e.clientX-drag.x)*0.008;S.pitch=Math.max(-0.2,Math.min(1.1,drag.pitch+(e.clientY-drag.y)*0.006));return}
  hover=null;for(var i=hits.length-1;i>=0;i--){var h=hits[i];if((x-h.x)*(x-h.x)+(y-h.y)*(y-h.y)<h.r*h.r){hover=h;break}}
  if(!hover){tip.hidden=true;return}tip.hidden=false;tip.textContent='';var b=document.createElement('div'),sm=document.createElement('small');
  if(hover.kind==='q'){b.textContent='"'+hover.o.quote+'"';sm.textContent=hover.o.id+', '+hover.o.domain}else{var st=hover.m.st[hover.cur-1];b.textContent=hover.m.p.name+', '+hover.m.p.segment;sm.textContent='Round '+hover.cur+': stance '+st.s+', '+st.a.replace('_',' ')+'. Cites '+hover.m.links.join(', ')}
  tip.appendChild(b);tip.appendChild(sm);tip.style.left=Math.min(x+16,r.width-370)+'px';tip.style.top=(y+16)+'px'});
cv.addEventListener('pointerleave',function(){hover=null;tip.hidden=true});
mark();
function frame(ts){if(stopped)return;var dt=last?Math.min(0.05,(ts-last)/1000):0;last=ts;
  if(playing){hold+=dt;if(hold>2.4){hold=0;target=target>=ROUNDS?1:target+1;mark()}if(!drag)S.yaw+=dt*0.12}
  var d=target-S.round;S.round+=Math.abs(d)<0.002?d:d*Math.min(1,dt*6);if(target===1&&S.round<1.001)S.round=1;
  S.talkPhase+=dt;S.focus=hover&&hover.kind==='p'?hover.m.p.id:null;S.focusQuotes=S.focus?hover.m.links:hover&&hover.kind==='q'?[hover.o.id]:null;
  draw(S);if(!reduce||drag||hover)requestAnimationFrame(frame);else setTimeout(function(){requestAnimationFrame(frame)},250)}
requestAnimationFrame(frame);
})();
`;
