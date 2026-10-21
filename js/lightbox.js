/* click any figure button to open the image large; arrows / swipe / Esc */
(function(){
  var figs=[].slice.call(document.querySelectorAll('.fig button[data-full]'));
  if(!figs.length) return;
  var lb=document.createElement('div'); lb.className='lb'; lb.hidden=true; lb.setAttribute('role','dialog'); lb.setAttribute('aria-modal','true'); lb.setAttribute('aria-label','Image viewer');
  lb.innerHTML='<button class="x" aria-label="Close">&times;</button><button class="p" aria-label="Previous">&larr;</button><button class="n" aria-label="Next">&rarr;</button><img alt=""><div class="cap"></div>';
  document.body.appendChild(lb);
  var img=lb.querySelector('img'), cap=lb.querySelector('.cap'), i=0, opener=null;
  img.onload=function(){var d=window.devicePixelRatio||1;img.style.setProperty('--nw',img.naturalWidth/d+'px');img.style.setProperty('--nh',img.naturalHeight/d+'px');};
  function show(k){ i=(k+figs.length)%figs.length; var b=figs[i]; img.style.removeProperty('--nw'); img.style.removeProperty('--nh'); img.src=b.getAttribute('data-full'); var i0=b.querySelector('img'); img.alt=i0?i0.alt:(b.getAttribute('aria-label')||'').replace('Enlarge: ',''); var c=b.closest('figure').querySelector('figcaption'); cap.textContent=c?c.textContent:''; }
  function open(k,b){ opener=b; show(k); lb.hidden=false; document.documentElement.style.overflow='hidden'; lb.querySelector('.x').focus(); }
  function close(){ lb.hidden=true; img.removeAttribute('src'); document.documentElement.style.overflow=''; if(opener) opener.focus(); }
  figs.forEach(function(b,k){ b.addEventListener('click',function(){ open(k,b); }); });
  lb.querySelector('.x').addEventListener('click',close);
  lb.querySelector('.p').addEventListener('click',function(){ show(i-1); });
  lb.querySelector('.n').addEventListener('click',function(){ show(i+1); });
  lb.addEventListener('click',function(e){ if(e.target===lb) close(); });
  document.addEventListener('keydown',function(e){ if(lb.hidden) return; if(e.key==='Escape') close(); else if(e.key==='ArrowLeft') show(i-1); else if(e.key==='ArrowRight') show(i+1); });
  var sx=null; lb.addEventListener('touchstart',function(e){ sx=e.touches[0].clientX; },{passive:true});
  lb.addEventListener('touchend',function(e){ if(sx==null) return; var dx=e.changedTouches[0].clientX-sx; sx=null; if(Math.abs(dx)>50) show(i+(dx<0?1:-1)); });
})();
