/* sets the letter-spacing of "Architecture Portfolio" so it is exactly as wide as the name above it */
(function(){
  function fit(){
    var a=document.querySelector('.top .name'); if(!a) return;
    var n=a.querySelector('span'), t=a.querySelector('small'); if(!n||!t) return;
    var cs=getComputedStyle(n), nl=parseFloat(cs.letterSpacing)||0;
    var nInk=n.getBoundingClientRect().width-nl;
    t.style.letterSpacing='0px';
    var w0=t.getBoundingClientRect().width, cnt=t.textContent.length;
    var ls=(nInk-w0)/(cnt-1);
    t.style.letterSpacing=ls+'px';
    t.style.marginRight=(-ls)+'px';
    n.style.marginRight=(-nl)+'px';
  }
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener('load',fit); fit();
})();

/* hamburger menu on narrow screens (the stylesheet decides when it shows) */
(function(){
  var top=document.querySelector('.top'), nav=top&&top.querySelector('nav'); if(!nav) return;
  var b=document.createElement('button'); b.type='button'; b.className='menu-btn'; b.setAttribute('aria-label','Menu'); b.setAttribute('aria-expanded','false'); b.setAttribute('aria-controls','siteNav'); b.innerHTML='<i></i>';
  nav.id='siteNav'; top.insertBefore(b,nav);
  function set(o){nav.classList.toggle('open',o);b.setAttribute('aria-expanded',o?'true':'false');}
  b.addEventListener('click',function(){set(!nav.classList.contains('open'));});
  nav.addEventListener('click',function(e){if(e.target.closest('a'))set(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false);});
  /* switch to the menu the moment the nav cannot sit on a single row */
  function check(){
    top.classList.remove('mm');
    if(getComputedStyle(nav).display==='none') return;
    var items=[].slice.call(nav.children); if(!items.length) return;
    function c(i){return i.offsetTop+i.offsetHeight/2;} var y=c(items[0]), wrapped=items.some(function(i){return Math.abs(c(i)-y)>6;});
    top.classList.toggle('mm',wrapped);
  }
  check();
  window.addEventListener('resize',check);
  window.addEventListener('load',check);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(check);
  if(window.ResizeObserver) new ResizeObserver(check).observe(document.documentElement);
})();

/* header: hide while scrolling down, show again on any scroll up */
(function(){
  var top=document.querySelector('.top'); if(!top) return;
  var last=window.scrollY, tick=false;
  function upd(){
    tick=false; var y=window.scrollY, d=y-last, h=top.offsetHeight;
    var nav=top.querySelector('nav');
    if(y<=h||d<-1||(nav&&nav.classList.contains('open'))||top.contains(document.activeElement)) top.classList.remove('hid');
    else if(d>3) top.classList.add('hid');
    last=y;
  }
  window.addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(upd);}},{passive:true});
  top.addEventListener('focusin',function(){top.classList.remove('hid');});
})();
