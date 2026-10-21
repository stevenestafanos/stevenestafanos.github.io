/* Story rows. Beside the text: the images that best match the text's height, either stacked at full
   column width or as one row of equal height. The rest continue below in rows of equal height
   (two or three across); wide drawings span the page. Phones: one column. */
(function(){
  var mq=window.matchMedia("(min-width:901px)"),CAP=34,GAP=28,HG=24;
  var rows=[].slice.call(document.querySelectorAll(".dproj .row:not(.solo)"));
  rows.forEach(function(r){var s=r.querySelector(".rmed")||r.querySelector(".rfull");r._its=[].slice.call(s.querySelectorAll(":scope>.it"));});
  function rr(it){return parseFloat(it.getAttribute("data-r"))||0;}
  function isWide(it){return it.classList.contains("wide")||!rr(it)||!!it.querySelector(".dwgfig,.sheetcard,.pair,.tables,.trio");}
  function jrow(list){var d=document.createElement("div");d.className="jrow";list.forEach(function(it){it.style.setProperty("--r",rr(it));d.appendChild(it);});return d;}
  function split(n){if(n<=3)return[n];if(n===4)return[2,2];var a=[];while(n>0){var k=(n===4)?2:Math.min(3,n);a.push(k);n-=k;}return a;}
  function below(full,list){
    var run=[];
    function flush(){if(!run.length)return;var i=0;split(run.length).forEach(function(k){var g=run.slice(i,i+k);i+=k;var d=jrow(g);if(k===1)d.classList.add("one");full.appendChild(d);});run=[];}
    list.forEach(function(it){if(isWide(it)){flush();full.appendChild(it);}else run.push(it);});flush();
  }
  function clean(r){
    var med=r.querySelector(".rmed"),full=r.querySelector(".rfull");
    r._its.forEach(function(it){(med||full).appendChild(it);});
    [].slice.call(r.querySelectorAll(".jrow")).forEach(function(x){x.remove();});
  }
  function lay(){
    rows.forEach(function(r){
      clean(r);var med=r.querySelector(".rmed"),full=r.querySelector(".rfull");
      if(!med){below(full,r._its.slice());return;}
      if(!mq.matches){r.classList.remove("has-full","no-side");return;}
      var th=r.querySelector(".rtxt").offsetHeight,Wc=(r.clientWidth-56)*0.6,pre=[];
      for(var i=0;i<r._its.length&&!isWide(r._its[i])&&i<4;i++)pre.push(r._its[i]);
      var best={k:0,mode:"",err:Infinity};
      for(var k=1;k<=pre.length;k++){
        var A=0,hs=0;for(var j=0;j<k;j++){A+=rr(pre[j]);hs+=Wc/rr(pre[j])+CAP;}
        hs+=GAP*(k-1);var hr=(Wc-HG*(k-1))/A+CAP;
        [["row",hr],["stack",hs]].forEach(function(o){if(k===1&&o[0]==="stack")return;var e=Math.abs(o[1]-th);if(e<best.err)best={k:k,mode:o[0],err:e};});
      }
      var fx=parseInt(r.getAttribute("data-side"),10);if(fx>=0&&fx<=pre.length)best={k:fx,mode:"stack"};
      var side=r._its.slice(0,best.k),rest=r._its.slice(best.k);
      if(best.mode==="row"&&best.k>1)med.appendChild(jrow(side));else side.forEach(function(it){med.appendChild(it);});
      if(best.k===1){var h1=Wc/rr(side[0]);med.style.setProperty("--cap",h1>Math.max(th*1.5,560)?Math.round(Math.max(th,480)*rr(side[0]))+"px":"none");}else med.style.setProperty("--cap","none");
      below(full,rest);
      r.classList.toggle("has-full",rest.length>0);r.classList.toggle("no-side",side.length===0);
    });
  }
  var t;function soon(){clearTimeout(t);t=setTimeout(lay,80);}
  lay();addEventListener("load",lay);addEventListener("resize",soon);
  if(mq.addEventListener)mq.addEventListener("change",lay);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(lay);
})();
