/* Deterrents only: no web page can fully stop copying of what the browser displays. */
(function(){
  function stop(e){var t=e.target; if(t&&t.closest&&t.closest('img,video,canvas,figure,.stage,.sheet,#wrap')){e.preventDefault();}}
  document.addEventListener('contextmenu',stop);
  document.addEventListener('dragstart',function(e){if(e.target&&/^(IMG|VIDEO|CANVAS)$/.test(e.target.tagName))e.preventDefault();});
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&/^[sSpP]$/.test(e.key)){e.preventDefault();}
  });
  var css=document.createElement('style');
  css.textContent='img,video,canvas{-webkit-user-drag:none;-webkit-touch-callout:none;user-select:none}@media print{body{display:none!important}}';
  document.head.appendChild(css);
})();
