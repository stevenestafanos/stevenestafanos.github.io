/* tap or click a bubble diagram to see it larger; tap again, Esc or the close button to return */
(function(){
  var svgs=[].slice.call(document.querySelectorAll('.partifig svg.parti, .adjfig svg'));
  if(!svgs.length) return;
  var pz=document.createElement('div'); pz.className='pz'; pz.hidden=true; pz.setAttribute('role','dialog'); pz.setAttribute('aria-modal','true'); pz.setAttribute('aria-label','Diagram, enlarged');
  var x=document.createElement('button'); x.type='button'; x.className='pz-x'; x.setAttribute('aria-label','Close'); x.innerHTML='&times;';
  pz.appendChild(x); document.body.appendChild(pz);
  var opener=null, big=null;
  function open(s){
    opener=s; big=s.cloneNode(true); big.removeAttribute('tabindex'); big.removeAttribute('role'); big.setAttribute('aria-hidden','true');
    pz.appendChild(big); pz.hidden=false; pz.scrollTop=0; pz.scrollLeft=0; document.documentElement.style.overflow='hidden'; x.focus();
  }
  function close(){
    if(big&&big.parentNode) big.parentNode.removeChild(big); big=null; pz.hidden=true; document.documentElement.style.overflow='';
    if(opener) opener.focus();
  }
  svgs.forEach(function(s){
    s.setAttribute('tabindex','0'); s.setAttribute('role','button');
    var l=s.getAttribute('aria-label')||'Diagram'; s.setAttribute('aria-label',l+'. Tap to enlarge.');
    s.addEventListener('click',function(){ open(s); });
    s.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(s); } });
  });
  x.addEventListener('click',close);
  pz.addEventListener('click',function(e){ if(e.target!==x) close(); });
  document.addEventListener('keydown',function(e){ if(!pz.hidden&&e.key==='Escape') close(); });
})();
