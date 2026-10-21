/* Interactive floor plans (design-amphitheatre.html).
   Vector plans from the original Revit drawings; room outlines traced from the plans (data/amph-plan.json).
   Zoom: buttons, pinch, Ctrl/Cmd + scroll, double-click. Pan: drag. */
(function(){
  var root=document.getElementById('explorer');if(!root)return;
  var NS='http://www.w3.org/2000/svg';
  var D,floor,group='all',sel=null,hov=null,colours=true,cache={},svg,vb,full={x:0,y:0,w:1,h:1},isFull=false;
  var $=function(s){return root.querySelector(s);};
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
  var view=$('.ex-view'),tip=$('.ex-tip'),info=$('.ex-info'),list=$('.ex-list'),chips=$('.ex-chips'),note=$('.ex-note');
  var GL={};
  fetch('data/amph-plan.json').then(function(r){return r.json();}).then(init).catch(function(){root.classList.add('ex-off');});

  function init(d){
    D=d;d.groups.forEach(function(g){GL[g.id]=g.label;});
    var tabs=$('.ex-tabs');
    d.floors.forEach(function(f,i){
      var b=el('button','ex-tab',f.label);b.type='button';b.setAttribute('role','tab');b.id='ex-tab-'+f.id;
      b.addEventListener('click',function(){setFloor(i);});
      b.addEventListener('keydown',function(e){var k=e.key,n=d.floors.length,j=-1;if(k==='ArrowRight')j=(i+1)%n;else if(k==='ArrowLeft')j=(i+n-1)%n;if(j>=0){e.preventDefault();setFloor(j);$('#ex-tab-'+d.floors[j].id).focus();}});
      tabs.appendChild(b);
    });
    var all=el('button','ex-chip','All rooms');all.type='button';all.dataset.g='all';chips.appendChild(all);
    d.groups.forEach(function(g){var b=el('button','ex-chip g-'+g.id);b.type='button';b.dataset.g=g.id;b.appendChild(el('i','ex-sw'));b.appendChild(document.createTextNode(g.label));chips.appendChild(b);});
    chips.addEventListener('click',function(e){var b=e.target.closest('.ex-chip');if(!b)return;group=(group===b.dataset.g&&b.dataset.g!=='all')?'all':b.dataset.g;sel=null;paint();});
    $('.ex-col').addEventListener('click',function(){colours=!colours;paint();});
    root.querySelectorAll('[data-z]').forEach(function(b){b.addEventListener('click',function(){var z=b.dataset.z;if(z==='fit')fit();else zoomAt(z==='in'?1/1.6:1.6);});});
    var secOn=true;$('.ex-sec').addEventListener('click',function(){secOn=!secOn;root.classList.toggle('ex-nosec',!secOn);this.setAttribute('aria-pressed',secOn);});
    $('.ex-full').addEventListener('click',toggleFull);
    document.addEventListener('keydown',function(e){if(isFull&&e.key==='Escape')toggleFull();});
    bindView();
    var h=(location.hash||'').replace('#','');var start=1;d.floors.forEach(function(f,i){if(h==='plan-'+f.id)start=i;});
    setFloor(start);root.classList.add('ex-on');
  }

  function setFloor(i){
    floor=D.floors[i];sel=null;hov=null;group='all';hideTip();
    D.floors.forEach(function(f){var t=$('#ex-tab-'+f.id);var on=f===floor;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;});
    root.classList.toggle('ex-site',!floor.rooms.length);
    note.hidden=!/f2|f3/.test(floor.id);
    view.setAttribute('aria-busy','true');
    load(floor).then(function(txt){
      if(D.floors[i]!==floor)return;
      view.innerHTML=txt;svg=view.querySelector('svg');svg.setAttribute('role','img');
      svg.setAttribute('aria-label',{site:'Site plan with the roof of the building',f1:'First floor plan',f2:'Second floor plan',f3:'Third floor plan'}[floor.id]);
      svg.setAttribute('preserveAspectRatio','xMidYMid meet');
      full={x:0,y:0,w:floor.w,h:floor.h};vb={x:0,y:0,w:floor.w,h:floor.h};apply();
      var g=svg.querySelector('.rooms');
      floor.rooms.forEach(function(r,k){var p=document.createElementNS(NS,'path');p.setAttribute('d',r.d);p.setAttribute('class','rm g-'+r.g);p.dataset.k=k;g.appendChild(p);});
      var dg=document.createElementNS(NS,'g');dg.setAttribute('class','dots');svg.appendChild(dg);
      floor.rooms.forEach(function(r,k){var q=document.createElementNS(NS,'g');q.setAttribute('class','dot g-'+r.g);q.dataset.k=k;
        ['hit','sq'].forEach(function(c){var e=document.createElementNS(NS,'rect');e.setAttribute('class',c);q.appendChild(e);});dg.appendChild(q);});
      sizeDots();
      view.removeAttribute('aria-busy');paint();
    });
  }
  function load(f){if(!cache[f.id])cache[f.id]=fetch(f.svg).then(function(r){return r.text();});return cache[f.id];}

  function paint(){
    root.classList.toggle('ex-nocol',!colours);$('.ex-col').setAttribute('aria-pressed',colours);
    chips.querySelectorAll('.ex-chip').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.g===group);});
    list.textContent='';
    floor.rooms.forEach(function(r,k){
      var on=group==='all'||r.g===group;
      if(svg){['.rm','.dot'].forEach(function(c){var p=svg.querySelector(c+'[data-k="'+k+'"]');if(p){p.classList.toggle('dim',!on);p.classList.toggle('on',sel===k);p.classList.toggle('hov',hov===k);}});}
      if(!on)return;
      var li=el('li');var b=el('button','ex-room g-'+r.g);b.type='button';b.appendChild(el('i','ex-sw'));b.appendChild(document.createTextNode(r.n));b.setAttribute('aria-pressed',sel===k);
      b.addEventListener('click',function(){pick(k,true);});
      b.addEventListener('mouseenter',function(){setHov(k);});b.addEventListener('mouseleave',function(){setHov(null);});
      b.addEventListener('focus',function(){setHov(k);});b.addEventListener('blur',function(){setHov(null);});
      li.appendChild(b);list.appendChild(li);
    });
    card();
  }
  function setHov(k){if(hov===k)return;hov=k;if(!svg)return;svg.querySelectorAll('.dot.hov').forEach(function(p){p.classList.remove('hov');});if(k!=null){var p=svg.querySelector('.dot[data-k="'+k+'"]');if(p)p.classList.add('hov');}}
  function pick(k,zoom){sel=(sel===k&&!zoom)?null:k;paint();if(zoom&&sel!=null)zoomTo(floor.rooms[k]);}
  function card(){
    info.textContent='';
    if(!floor.rooms.length){info.appendChild(el('p',null,'The site plan shows the roof of the building, with the water feature and tiered seating at the centre, parking at one end and a children’s play area at the other.'));return;}
    if(sel==null){info.appendChild(el('p','ex-hint','Hover over or tap a dot to see the room and its use. Zoom with the buttons, a pinch, a double-click or Ctrl and scroll, and drag to move around.'));return;}
    var r=floor.rooms[sel];var s=el('span','ex-grp g-'+r.g);s.appendChild(el('i','ex-sw'));s.appendChild(document.createTextNode(GL[r.g]||''));
    info.appendChild(el('strong',null,r.n));info.appendChild(s);if(r.t)info.appendChild(el('p',null,r.t));
  }

  /* tooltip */
  function showTip(k,cx,cy){var r=floor.rooms[k];tip.textContent='';tip.appendChild(el('strong',null,r.n));var s=el('span','g-'+r.g);s.appendChild(el('i','ex-sw'));s.appendChild(document.createTextNode(GL[r.g]||''));tip.appendChild(s);if(r.t)tip.appendChild(el('em',null,r.t));
    tip.hidden=false;var box=view.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight;var x=cx-box.left+16,y=cy-box.top+16;if(x+tw>box.width-8)x=cx-box.left-tw-14;if(y+th>box.height-8)y=cy-box.top-th-14;tip.style.left=Math.max(6,x)+'px';tip.style.top=Math.max(6,y)+'px';}
  function hideTip(){tip.hidden=true;}

  /* zoom and pan via viewBox */
  function sizeDots(){if(!svg||!floor)return;var s=scaleInfo().s;if(!(s>0))return;var v=11/s,h=30/s;svg.querySelectorAll('.dot').forEach(function(q){var r=floor.rooms[+q.dataset.k];if(!r)return;var a=q.firstChild,b=q.lastChild;a.setAttribute('x',r.mx-h/2);a.setAttribute('y',r.my-h/2);a.setAttribute('width',h);a.setAttribute('height',h);b.setAttribute('x',r.mx-v/2);b.setAttribute('y',r.my-v/2);b.setAttribute('width',v);b.setAttribute('height',v);});}
  addEventListener('resize',sizeDots);
  function apply(){if(!svg)return;svg.setAttribute('viewBox',vb.x+' '+vb.y+' '+vb.w+' '+vb.h);var z=full.w/vb.w;root.classList.toggle('ex-zoomed',z>1.02);svg.style.setProperty('--z',z);sizeDots();}
  function clamp(){var minW=full.w/14;if(vb.w<minW){var s=minW/vb.w;vb.w*=s;vb.h*=s;}if(vb.w>full.w){vb.w=full.w;vb.h=full.h;}
    vb.x=Math.min(Math.max(vb.x,full.x-vb.w*0.25),full.w-vb.w*0.75);vb.y=Math.min(Math.max(vb.y,full.y-vb.h*0.25),full.h-vb.h*0.75);if(vb.w>=full.w){vb.x=0;vb.y=0;}}
  function scaleInfo(){var b=view.getBoundingClientRect();var s=Math.min(b.width/vb.w,b.height/vb.h);var ox=(b.width-vb.w*s)/2,oy=(b.height-vb.h*s)/2;return {b:b,s:s,ox:ox,oy:oy};}
  function toSvg(cx,cy){var i=scaleInfo();return {x:vb.x+(cx-i.b.left-i.ox)/i.s,y:vb.y+(cy-i.b.top-i.oy)/i.s};}
  function zoomAt(f,cx,cy){if(!svg)return;var b=view.getBoundingClientRect();if(cx==null){cx=b.left+b.width/2;cy=b.top+b.height/2;}
    var p=toSvg(cx,cy);var nw=Math.min(full.w,Math.max(full.w/14,vb.w*f));var k=nw/vb.w;vb.x=p.x-(p.x-vb.x)*k;vb.y=p.y-(p.y-vb.y)*k;vb.w=nw;vb.h=vb.h*k;clamp();apply();}
  function fit(){vb={x:0,y:0,w:full.w,h:full.h};apply();}
  function zoomTo(r){var bb=svg.querySelector('.rm[data-k="'+floor.rooms.indexOf(r)+'"]').getBBox();var pad=Math.max(bb.width,bb.height)*0.9+60;var w=Math.max(bb.width+pad,full.w/6),h=w*full.h/full.w;if(bb.height+pad>h){h=bb.height+pad;w=h*full.w/full.h;}
    vb={x:bb.x+bb.width/2-w/2,y:bb.y+bb.height/2-h/2,w:w,h:h};clamp();apply();}

  function bindView(){
    var pts={},start=null,moved=false,pinch=null;
    view.addEventListener('wheel',function(e){if(!svg)return;if(!(e.ctrlKey||e.metaKey||isFull))return;e.preventDefault();zoomAt(Math.exp(e.deltaY*(e.deltaMode?0.05:0.0022)),e.clientX,e.clientY);},{passive:false});
    var gs=1;view.addEventListener('gesturestart',function(e){e.preventDefault();gs=1;});
    view.addEventListener('gesturechange',function(e){e.preventDefault();zoomAt(gs/e.scale,e.clientX,e.clientY);gs=e.scale;});
    view.addEventListener('dblclick',function(e){e.preventDefault();zoomAt(e.shiftKey?1.8:1/1.8,e.clientX,e.clientY);});
    view.addEventListener('pointerdown',function(e){if(!svg)return;pts[e.pointerId]={x:e.clientX,y:e.clientY};var n=Object.keys(pts).length;
      if(n===1){start={x:e.clientX,y:e.clientY,vx:vb.x,vy:vb.y};moved=false;}
      if(n===2){var a=Object.values(pts);pinch={d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),w:vb.w};start=null;}
      if(e.pointerType==='mouse'||root.classList.contains('ex-zoomed')||n===2){try{view.setPointerCapture(e.pointerId);}catch(x){}}});
    view.addEventListener('pointermove',function(e){
      if(pts[e.pointerId]){pts[e.pointerId]={x:e.clientX,y:e.clientY};var a=Object.values(pts);
        if(pinch&&a.length===2){var dd=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(dd>0){var cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2;zoomAt((pinch.w*pinch.d/dd)/vb.w,cx,cy);}moved=true;return;}
        if(start&&(e.pointerType==='mouse'||root.classList.contains('ex-zoomed'))){var dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
          if(moved&&root.classList.contains('ex-zoomed')){var s=scaleInfo().s;vb.x=start.vx-dx/s;vb.y=start.vy-dy/s;clamp();apply();view.classList.add('drag');hideTip();return;}}}
      if(e.pointerType==='mouse'){var p=e.target.closest&&e.target.closest('.dot');var k=p?+p.dataset.k:null;if(p&&p.classList.contains('dim'))k=null;setHov(k);if(k!=null)showTip(k,e.clientX,e.clientY);else hideTip();}
    });
    function end(e){var was=pts[e.pointerId];delete pts[e.pointerId];view.classList.remove('drag');
      if(Object.keys(pts).length<2)pinch=null;
      if(was&&!moved&&e.type==='pointerup'){var p=document.elementFromPoint(e.clientX,e.clientY);p=p&&p.closest&&p.closest('.dot');if(p&&!p.classList.contains('dim')){var k=+p.dataset.k;pick(k,false);if(e.pointerType!=='mouse'&&sel!=null)showTip(k,e.clientX,e.clientY);}else if(e.pointerType!=='mouse'){hideTip();}}
      if(!Object.keys(pts).length)start=null;}
    view.addEventListener('pointerup',end);view.addEventListener('pointercancel',end);
    view.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){setHov(null);hideTip();}});
    view.addEventListener('keydown',function(e){var k=e.key,s=vb.w*0.1;
      if(k==='+'||k==='='){zoomAt(1/1.4);}else if(k==='-'||k==='_'){zoomAt(1.4);}else if(k==='0'){fit();}
      else if(k==='ArrowLeft'){vb.x-=s;}else if(k==='ArrowRight'){vb.x+=s;}else if(k==='ArrowUp'){vb.y-=s;}else if(k==='ArrowDown'){vb.y+=s;}else return;
      e.preventDefault();clamp();apply();});
  }
  function toggleFull(){isFull=!isFull;root.classList.toggle('ex-fs',isFull);document.documentElement.style.overflow=isFull?'hidden':'';
    $('.ex-full').textContent=isFull?'Close':'Full screen';$('.ex-full').setAttribute('aria-pressed',isFull);requestAnimationFrame(sizeDots);if(isFull)view.focus({preventScroll:true});else $('.ex-full').focus({preventScroll:true});}
})();
