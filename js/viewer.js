/* Drawing viewer: renders only the visible region of a PDF page at the current zoom, so vector sheets stay crisp
   at any magnification and big sheets stay light. Scale detection is read from the sheet text; the measurement
   is indicative ("do not scale drawings") and always states which scale it used. */
(function(){
  'use strict';
  var pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  var $ = function(id){ return document.getElementById(id); };
  var wrap = $('canvasWrap'), stage = $('stage'), overlay = $('overlay');
  var sets = [], cur = null, doc = null, pageNum = 1, page = null, pageW = 0, pageH = 0;
  var s = 1, tx = 0, ty = 0;                 // screen = pagePt * s + (tx, ty), in CSS px
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var active = null, renderTask = null, renderTimer = null, token = 0;
  var last = null;                            // {s, tx, ty} of the canvas currently shown
  var linksEl = $('links'), linkItems = [];     // link annotations of the current sheet
  var measuring = false, pts = [], scalesOnPage = [], scaleLabels = [], scalesReady = false;
  var PAPER = 96/72;                          // CSS px per pt at true paper size

  function status(t){ $('status').textContent = t || ''; }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function fitScale(){ var r = stage.getBoundingClientRect(); return Math.min((r.width - 24)/pageW, (r.height - 84)/pageH); }
  function minS(){ return fitScale()*0.6; }
  function maxS(){ return PAPER*10; }

  /* ---------- scale parsing ---------- */
  var FR = {'¼':0.25, '½':0.5, '¾':0.75, '⅛':0.125, '⅜':0.375, '⅝':0.625, '⅞':0.875};
  function parseFrac(t){
    t = t.trim(); if (FR[t] != null) return FR[t];
    var m = t.match(/^(\d+)\s*[-\s]\s*(\d+)\/(\d+)$/); if (m) return +m[1] + m[2]/m[3];
    m = t.match(/^(\d+)\/(\d+)$/); if (m) return m[1]/m[2];
    m = t.match(/^(\d+(?:\.\d+)?)$/); if (m) return +m[1];
    m = t.match(/^(\d+)\s*[-\s]?\s*([¼½¾⅛⅜⅝⅞])$/); if (m) return +m[1] + FR[m[2]];
    return NaN;
  }
  var IMP = /((?:\d+\s*[-\s]\s*)?\d+\/\d+|\d+\s*[-\s]?\s*[¼½¾⅛⅜⅝⅞]|[¼½¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*["”″]\s*=\s*(\d+)\s*['’′]\s*-?\s*(\d+)?\s*["”″]?/g;
  var MET = /(^|[^\d:.\/])1\s*:\s*(\d{1,4})(?!\d|\s*:|\s*[AaPp][Mm])/g;
  var METOK = {2:1,5:1,10:1,20:1,25:1,50:1,75:1,100:1,125:1,150:1,200:1,250:1,400:1,500:1,1000:1};
  // a scale is {label, k, kind}: real = paper * k. imperial: paper inches -> real inches. metric: paper mm -> real mm.
  function impScale(frac, feet, inches){
    var realIn = (+feet)*12 + (inches ? +inches : 0), k = realIn/frac;
    var fr = frac === 0.25 ? '1/4' : frac === 0.125 ? '1/8' : frac === 0.1875 ? '3/16' : frac === 0.5 ? '1/2' : frac === 0.75 ? '3/4' : frac === 0.375 ? '3/8' : frac === 1.5 ? '1-1/2' : frac === 0.0625 ? '1/16' : frac === 0.09375 ? '3/32' : String(frac);
    return {label: fr + '" = ' + feet + "'-" + (inches || 0) + '"', k:k, kind:'imperial'};
  }
  function metScale(n){ return {label:'1 : ' + n, k:n, kind:'metric'}; }

  function textToLabels(items){
    // join neighbouring text items on one line so "SCALE:" and its value, or split fractions, read as one string
    var rows = {}, out = [];
    items.forEach(function(it){
      if (!it.str || !it.str.trim()) return;
      var x = it.transform[4], y = it.transform[5], key = Math.round(y/3);
      (rows[key] = rows[key] || []).push({x:x, y:y, w:it.width||0, t:it.str});
    });
    Object.keys(rows).forEach(function(k){
      var r = rows[k].sort(function(a,b){ return a.x - b.x; }), cluster = [r[0]];
      function flush(){
        var str = cluster.map(function(c){ return c.t; }).join(' ').replace(/\s+/g, ' ');
        var m, re;
        re = new RegExp(IMP.source, 'g');
        while ((m = re.exec(str))){
          var fr = parseFrac(m[1]); if (!(fr > 0) || fr > 12) continue;
          var sc = impScale(fr, m[2], m[3]); sc.x = cluster[0].x; sc.y = cluster[0].y; out.push(sc);
        }
        re = new RegExp(MET.source, 'g');
        while ((m = re.exec(str))){
          if (!METOK[m[2]]) continue;
          var ms = metScale(+m[2]); ms.x = cluster[0].x; ms.y = cluster[0].y; out.push(ms);
        }
      }
      for (var i = 1; i < r.length; i++){
        var prev = cluster[cluster.length-1];
        if (r[i].x - (prev.x + prev.w) < 40) cluster.push(r[i]); else { flush(); cluster = [r[i]]; }
      }
      flush();
    });
    return out;
  }

  /* ---------- measurement formatting ---------- */
  function fmtImperial(inches){
    var neg = inches < 0; inches = Math.abs(inches);
    var total = Math.round(inches*2)/2;               // nearest 1/2 in: the precision of a click on screen
    var ft = Math.floor(total/12), rem = total - ft*12;
    var ri = Math.floor(rem), half = rem - ri;
    var s = (neg ? '-' : '') + ft + "'-" + ri + (half ? '½' : '') + '"';
    return s;
  }
  function fmtMetric(mm){
    if (mm >= 1000) return (mm/1000).toFixed(2) + ' m  (' + Math.round(mm).toLocaleString('en-CA') + ' mm)';
    return Math.round(mm).toLocaleString('en-CA') + ' mm';
  }


  /* ---------- links carried by the sheet ---------- */
  function clearLinks(){ linkItems = []; if (linksEl) linksEl.textContent = ''; }
  function setLinks(annots){
    clearLinks(); if (!linksEl) return;
    annots.forEach(function(a){
      if (a.subtype !== 'Link' || !a.url || !a.rect) return;
      if (!/^https:\/\//i.test(a.url)) return;
      var el = document.createElement('a'); el.href = a.url; el.target = '_blank'; el.rel = 'noopener noreferrer';
      var host = ''; try { host = new URL(a.url).hostname.replace(/^www\./, ''); } catch(e){}
      el.title = 'Open on ' + host; el.setAttribute('aria-label', 'Open product page on ' + host);
      linksEl.appendChild(el);
      linkItems.push({el:el, x1:Math.min(a.rect[0], a.rect[2]), y1:Math.min(a.rect[1], a.rect[3]), x2:Math.max(a.rect[0], a.rect[2]), y2:Math.max(a.rect[1], a.rect[3])});
    });
    drawLinks();
  }
  function drawLinks(){
    if (!linkItems.length) return;
    var px = 3, py = 3;                          // a little hit area beyond the printed text
    linkItems.forEach(function(it){
      var l = tx + it.x1*s - px, t = ty + (pageH - it.y2)*s - py, w = (it.x2 - it.x1)*s + 2*px, h = (it.y2 - it.y1)*s + 2*py;
      it.el.style.left = l + 'px'; it.el.style.top = t + 'px'; it.el.style.width = w + 'px'; it.el.style.height = h + 'px';
    });
  }

  /* ---------- rendering ---------- */
  function applyCss(){
    if (!active) return;
    if (!last){ return; }
    var k = s/last.s;
    active.style.transform = 'translate(' + (tx - last.tx*k) + 'px,' + (ty - last.ty*k) + 'px) scale(' + k + ')';
    drawOverlay(); drawLinks();
  }
  function render(){
    if (!page) return;
    if (renderTask){ try{ renderTask.cancel(); }catch(e){} renderTask = null; }
    var r = wrap.getBoundingClientRect(), W = Math.ceil(r.width*dpr), H = Math.ceil(r.height*dpr);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    var ctx = c.getContext('2d'); ctx.fillStyle = '#26282b'; ctx.fillRect(0, 0, W, H);
    // page paper
    var vp = page.getViewport({scale: s*dpr, offsetX: tx*dpr, offsetY: ty*dpr});
    ctx.fillStyle = '#fff'; ctx.fillRect(tx*dpr, ty*dpr, pageW*s*dpr, pageH*s*dpr);
    var my = ++token, snap = {s:s, tx:tx, ty:ty};
    var task = page.render({canvasContext:ctx, viewport:vp, background:'rgba(0,0,0,0)'});
    renderTask = task;
    $('loading').hidden = !!last;
    task.promise.then(function(){
      if (my !== token) return;
      if (active && active.parentNode) active.parentNode.removeChild(active);
      c.style.transform = ''; wrap.insertBefore(c, wrap.firstChild);
      active = c; last = snap; $('loading').hidden = true; applyCss(); updateStatus();
    }).catch(function(e){ if (e && e.name !== 'RenderingCancelledException') status('Could not draw this sheet.'); });
  }
  function schedule(){ applyCss(); clearTimeout(renderTimer); renderTimer = setTimeout(render, 90); updateStatus(); }
  function updateStatus(){
    var pct = Math.round(s/PAPER*100);
    status(pageW ? (Math.round(pageW/72*10)/10 + ' × ' + Math.round(pageH/72*10)/10 + ' in sheet · ' + pct + '% of paper size') : '');
  }
  function setView(ns, cx, cy){                       // zoom about screen point (cx, cy)
    ns = clamp(ns, minS(), maxS());
    var px = (cx - tx)/s, py = (cy - ty)/s;
    s = ns; tx = cx - px*s; ty = cy - py*s; schedule();
  }
  function fit(){
    var r = wrap.getBoundingClientRect();
    s = fitScale(); tx = (r.width - pageW*s)/2; ty = (r.height - pageH*s)/2 - 22; last && (last = last); schedule();
  }
  function paperSize(){
    var r = wrap.getBoundingClientRect(), cx = r.width/2, cy = r.height/2; setView(PAPER, cx, cy);
  }

  /* ---------- pointer handling ---------- */
  var ptrs = new Map(), startDist = 0, startS = 1, dragMoved = 0, downAt = null;
  wrap.addEventListener('pointerdown', function(e){
    wrap.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
    dragMoved = 0; downAt = {x:e.clientX, y:e.clientY};
    if (ptrs.size === 2){ var a = Array.from(ptrs.values()); startDist = Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y); startS = s; }
    wrap.classList.add('panning');
  });
  wrap.addEventListener('pointermove', function(e){
    var p = ptrs.get(e.pointerId); if (!p) return;
    var r = wrap.getBoundingClientRect();
    if (ptrs.size === 1){
      var dx = e.clientX - p.x, dy = e.clientY - p.y; dragMoved += Math.abs(dx) + Math.abs(dy);
      tx += dx; ty += dy; schedule();
    } else if (ptrs.size === 2){
      var old = Array.from(ptrs.values()); var mx0 = (old[0].x+old[1].x)/2, my0 = (old[0].y+old[1].y)/2;
      p.x = e.clientX; p.y = e.clientY;
      var a = Array.from(ptrs.values()), d = Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y);
      var mx = (a[0].x+a[1].x)/2, my = (a[0].y+a[1].y)/2;
      tx += mx - mx0; ty += my - my0; dragMoved += 20;
      if (startDist) setView(startS*d/startDist, mx - r.left, my - r.top);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  function up(e){
    var had = ptrs.delete(e.pointerId);
    if (!ptrs.size) wrap.classList.remove('panning');
    if (had && measuring && dragMoved < 6 && downAt) addPoint(e.clientX, e.clientY);
  }
  wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', function(e){ ptrs.delete(e.pointerId); wrap.classList.remove('panning'); });
  // trackpad: two fingers pan, pinch zooms (Chrome, Edge, Firefox send pinch as ctrl+wheel). A mouse wheel pans too; hold Ctrl or Cmd to zoom with it.
  wrap.addEventListener('wheel', function(e){
    var r = wrap.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey){
      e.preventDefault();
      setView(s*Math.exp(-e.deltaY*(e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    // at fit size a mostly horizontal swipe is left to the browser, so two-finger back/forward still works
    if (!zoomedIn() && Math.abs(e.deltaX) > Math.abs(e.deltaY)*1.5) return;
    e.preventDefault();
    var k = e.deltaMode === 1 ? 16 : 1;
    tx -= e.deltaX*k; ty -= e.deltaY*k; schedule();
  }, {passive:false});
  // Safari sends pinch as gesture events instead
  var gS = 1;
  wrap.addEventListener('gesturestart', function(e){ e.preventDefault(); gS = s; });
  wrap.addEventListener('gesturechange', function(e){ e.preventDefault(); var r = wrap.getBoundingClientRect(); setView(gS*e.scale, e.clientX - r.left, e.clientY - r.top); });
  wrap.addEventListener('gestureend', function(e){ e.preventDefault(); });
  wrap.addEventListener('dblclick', function(){ if (!measuring) fit(); });
  function zoomedIn(){ return s > fitScale()*1.03; }
  // slideshow keys anywhere on the page (not inside form controls) while the sheet is at fit size
  document.addEventListener('keydown', function(e){
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var t = e.target; if (wrap.contains(t) || (t && /^(SELECT|INPUT|TEXTAREA)$/.test(t.tagName))) return;
    if (!doc || zoomedIn()) return;
    go(pageNum + (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault();
  });
  wrap.addEventListener('keydown', function(e){
    var step = 80;
    if (e.key === '+' || e.key === '='){ var r = wrap.getBoundingClientRect(); setView(s*1.25, r.width/2, r.height/2); }
    else if (e.key === '-'){ var r2 = wrap.getBoundingClientRect(); setView(s/1.25, r2.width/2, r2.height/2); }
    else if (e.key === 'ArrowLeft'){ if (!zoomedIn()) go(pageNum - 1); else { tx += step; schedule(); } } else if (e.key === 'ArrowRight'){ if (!zoomedIn()) go(pageNum + 1); else { tx -= step; schedule(); } }
    else if (e.key === 'ArrowUp'){ ty += step; schedule(); } else if (e.key === 'ArrowDown'){ ty -= step; schedule(); }
    else if (e.key === '0'){ fit(); } else if (e.key === 'm' || e.key === 'M'){ toggleMeasure(); }
    else if (e.key === 'Escape'){ clearMeasure(); } else if (e.key === '[' || e.key === 'PageUp'){ go(pageNum - 1); } else if (e.key === ']' || e.key === 'PageDown'){ go(pageNum + 1); }
    else return; e.preventDefault();
  });
  window.addEventListener('resize', function(){ if (page) { schedule(); } });

  /* ---------- measure ---------- */
  function toPage(cx, cy){ var r = wrap.getBoundingClientRect(); return {x:(cx - r.left - tx)/s, y:(cy - r.top - ty)/s}; }
  function toScreen(p){ return {x:p.x*s + tx, y:p.y*s + ty}; }
  function addPoint(cx, cy){
    if (pts.length >= 2) pts = [];
    pts.push(toPage(cx, cy)); report(); drawOverlay();
  }
  function curScale(){
    var v = $('scaleSelect').value; if (!v) return null;
    var o = $('scaleSelect').selectedOptions[0]; return {k:+o.dataset.k, kind:o.dataset.kind, label:o.textContent};
  }
  function report(){
    var out = $('measureOut');
    if (pts.length < 2){ out.textContent = pts.length ? 'Click the second point.' : 'Click two points.'; return; }
    var sc = curScale(); var dpt = Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y), paperIn = dpt/72;
    if (!sc){ out.textContent = 'Paper distance ' + paperIn.toFixed(3) + ' in. Pick a scale.'; return; }
    var txt;
    if (sc.kind === 'imperial') txt = fmtImperial(paperIn*sc.k);
    else txt = fmtMetric(paperIn*25.4*sc.k);
    out.textContent = txt + '   at ' + sc.label + '   (paper ' + paperIn.toFixed(3) + ' in)';
  }
  function drawOverlay(){
    var r = wrap.getBoundingClientRect(); overlay.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height);
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    if (!pts.length) return;
    var NS = 'http://www.w3.org/2000/svg', a = toScreen(pts[0]);
    function circ(p){ var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 4); overlay.appendChild(c); }
    circ(a);
    if (pts.length === 2){
      var b = toScreen(pts[1]), l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y); overlay.appendChild(l); circ(b);
      var t = document.createElementNS(NS, 'text'); t.setAttribute('x', (a.x+b.x)/2 + 8); t.setAttribute('y', (a.y+b.y)/2 - 8);
      t.textContent = $('measureOut').textContent.split('   ')[0]; overlay.appendChild(t);
    }
  }
  function clearMeasure(){ pts = []; drawOverlay(); report(); }
  function toggleMeasure(){
    if (cur && cur.measure === false) return;
    measuring = !measuring; $('btnMeasure').setAttribute('aria-pressed', measuring);
    $('measureBar').hidden = !measuring; wrap.classList.toggle('measuring', measuring);
    if (!measuring) clearMeasure(); else buildScaleSelect();
  }
  function buildScaleSelect(){
    var sel = $('scaleSelect'); sel.innerHTML = '';
    var det = scalesOnPage, seen = {};
    function opt(sc, suffix){
      var o = document.createElement('option'); o.textContent = sc.label + (suffix || ''); o.value = sc.label; o.dataset.k = sc.k; o.dataset.kind = sc.kind; sel.appendChild(o);
    }
    det.forEach(function(sc){ if (!seen[sc.label]){ seen[sc.label] = 1; opt(sc, '  (on this sheet)'); } });
    if (!det.length){ var o = document.createElement('option'); o.value = ''; o.textContent = scalesReady ? 'No scale found on this sheet: pick one' : 'Reading scales on this sheet...'; sel.appendChild(o); }
    var presets;
    if (cur.units === 'metric'){
      presets = [2,5,10,20,25,50,75,100,150,200,250,400,500].map(metScale);
    } else {
      presets = [[1/16,'1/16'],[3/32,'3/32'],[1/8,'1/8'],[3/16,'3/16'],[1/4,'1/4'],[3/8,'3/8'],[1/2,'1/2'],[3/4,'3/4'],[1,'1'],[1.5,'1 1/2'],[3,'3']].map(function(q){
        return {label:q[1] + '" = 1\'-0"', k:12/q[0], kind:'imperial'}; });
    }
    presets.forEach(function(sc){ if (!seen[sc.label]){ seen[sc.label] = 1; opt(sc); } });
    sel.onchange = function(){ report(); drawOverlay(); };
    if (det.length) sel.selectedIndex = 0;   // most prominent label on the sheet; the user can change it per view
    report();
  }

  /* ---------- pages and sets ---------- */
  function go(n){
    if (!doc) return; n = clamp(n, 1, doc.numPages); if (n === pageNum && page) return; load(n);
  }
  function load(n){
    pageNum = n; $('loading').hidden = false; clearMeasure(); last = null; scalesReady = false; scalesOnPage = []; clearLinks();
    if (active){ active.style.opacity = '.35'; }
    doc.getPage(n).then(function(p){
      page = p; var v = p.getViewport({scale:1}); pageW = v.width; pageH = v.height;
      markCurrent(); $('pageLabel').textContent = (sheetNo(cur, n) || 'Sheet ' + n) + ' · ' + n + ' / ' + doc.numPages;
      fit(); render();
      p.getAnnotations().then(function(an){ if (pageNum === n) setLinks(an); }).catch(function(){});
      p.getTextContent().then(function(tc){
        if (pageNum !== n) return;
        scaleLabels = textToLabels(tc.items);
        // tally: the scale named most often on the sheet leads the list
        var tally = {}, byLabel = {};
        scaleLabels.forEach(function(sc){ tally[sc.label] = (tally[sc.label]||0) + 1; byLabel[sc.label] = sc; });
        scalesOnPage = Object.keys(tally).sort(function(a,b){ return tally[b]-tally[a]; }).map(function(k){ return byLabel[k]; });
        var ov = cur && cur.pageScales && cur.pageScales[n];
        if (ov){ var os = impScale(ov.frac, ov.feet, ov.inches || 0); os.label += ' (checked against the sheet; title block differs)'; scalesOnPage = [os]; }
        scalesReady = true; if (measuring) buildScaleSelect();
        var sub = document.querySelector('#sheetList li:nth-child(' + n + ') .sub');
        if (sub && scalesOnPage.length && !(cur && cur.sheetNames)) sub.textContent = scalesOnPage.slice(0,2).map(function(x){ return x.label; }).join(' · ');
      }).catch(function(){ scalesReady = true; if (measuring) buildScaleSelect(); });
    });
    try { history.replaceState(null, '', '#' + cur.id + '-p' + n); } catch(e){}
  }
  function markCurrent(){
    document.querySelectorAll('#sheetList button').forEach(function(b, i){ b.setAttribute('aria-current', i + 1 === pageNum ? 'true' : 'false'); });
    var el = document.querySelector('#sheetList button[aria-current="true"]'); var L = document.getElementById('sheetList'); if (el && L) { var r = el.getBoundingClientRect(), lr = L.getBoundingClientRect(); if (r.top < lr.top) L.scrollTop -= lr.top - r.top; else if (r.bottom > lr.bottom) L.scrollTop += r.bottom - lr.bottom; }
  }
  var thumbQueue = [], thumbBusy = false;
  function thumb(canvas, n, myDoc){
    thumbQueue.push({canvas:canvas, n:n, doc:myDoc}); pump();
  }
  function pump(){
    if (thumbBusy || !thumbQueue.length) return; var j = thumbQueue.shift(); thumbBusy = true;
    if (j.doc !== doc){ thumbBusy = false; return pump(); }
    j.doc.getPage(j.n).then(function(p){
      var v0 = p.getViewport({scale:1}), sc = 160/v0.width, v = p.getViewport({scale:sc*1.5});
      j.canvas.width = v.width; j.canvas.height = v.height; j.canvas.style.aspectRatio = v0.width + '/' + v0.height;
      return p.render({canvasContext:j.canvas.getContext('2d'), viewport:v}).promise;
    }).catch(function(){}).then(function(){ thumbBusy = false; setTimeout(pump, 0); });
  }
  /* sheet numbers: set.sheetNos, or the leading number of set.sheetNames ("A0.0 Cover") */
  function sheetNo(set, i){
    if (!set) return '';
    if (set.sheetNos && set.sheetNos[i-1]) return set.sheetNos[i-1];
    var m = set.sheetNames && set.sheetNames[i-1] && /^([A-Z]+-?\d+(?:\.\d+)?)\s/.exec(set.sheetNames[i-1]);
    return m ? m[1] : '';
  }
  function sheetTitle(set, i){
    var s = set.sheetNames[i-1], no = sheetNo(set, i);
    return no && s.indexOf(no + ' ') === 0 ? s.slice(no.length + 1) : s;
  }
  function openSet(id, n){
    var set = sets.filter(function(x){ return x.id === id; })[0] || sets[0]; cur = set;
    if (measuring) toggleMeasure(); $('btnMeasure').hidden = set.measure === false; $('btnPrint').hidden = set.measure === false; $('setSelect').value = set.id; $('vTitle').textContent = set.title; $('vCourse').textContent = set.course + ' · ' + set.software;
    document.title = set.title + ' | Working Drawings | Steven Estafanos';
    $('loading').hidden = false; status('');
    thumbQueue = []; doc = null; page = null;
    pdfjs.getDocument({url:set.file}).promise.then(function(d){
      doc = d; var ol = $('sheetList'); ol.innerHTML = ''; $('sheetCount').textContent = d.numPages + ' sheets';
      for (var i = 1; i <= d.numPages; i++){
        (function(i){
          var li = document.createElement('li'), b = document.createElement('button'), c = document.createElement('canvas'), tx = document.createElement('span');
          b.type = 'button'; tx.innerHTML = '<span class="num"></span><span class="sub"></span>';
          tx.querySelector('.num').textContent = sheetNo(set, i) || 'Sheet ' + i;
          if (set.sheetNames && set.sheetNames[i-1]) tx.querySelector('.sub').textContent = sheetTitle(set, i);
          b.appendChild(c); b.appendChild(tx); li.appendChild(b); ol.appendChild(li);
          b.addEventListener('click', function(){ go(i); $('sheets').classList.remove('open'); $('btnSheets').setAttribute('aria-expanded', 'false'); });
          thumb(c, i, d);
        })(i);
      }
      load(clamp(n || 1, 1, d.numPages));
    }).catch(function(){ $('loading').hidden = false; $('loading').textContent = 'Could not load this drawing set.'; });
  }

  /* ---------- wiring ---------- */
  $('btnPrev').onclick = function(){ go(pageNum - 1); }; $('btnNext').onclick = function(){ go(pageNum + 1); };
  $('btnFit').onclick = fit; $('btnPrint').onclick = paperSize;
  $('btnIn').onclick = function(){ var r = wrap.getBoundingClientRect(); setView(s*1.4, r.width/2, r.height/2); };
  $('btnOut').onclick = function(){ var r = wrap.getBoundingClientRect(); setView(s/1.4, r.width/2, r.height/2); };
  $('btnMeasure').onclick = toggleMeasure; $('btnClear').onclick = clearMeasure;
  $('btnSheets').onclick = function(){ var o = $('sheets').classList.toggle('open'); $('btnSheets').setAttribute('aria-expanded', o); };
  $('setSelect').onchange = function(){ openSet(this.value, 1); };

  fetch('data/drawings.json').then(function(r){ return r.json(); }).then(function(d){
    sets = d.sets; var sel = $('setSelect');
    sets.forEach(function(x){ var o = document.createElement('option'); o.value = x.id; o.textContent = x.title; sel.appendChild(o); });
    function fromHash(){ var raw = (location.hash || '').replace('#', ''), m = raw.match(/^(.+)-p(\d+)$/), id = (m ? m[1] : raw) || sets[0].id, n = m ? +m[2] : 1;
      if (cur && cur.id === id){ if (n !== pageNum) go(n); } else openSet(id, n); }
    fromHash(); window.addEventListener('hashchange', fromHash);
  }).catch(function(){ status('Could not read data/drawings.json. Serve this folder over http (not file://).'); });
  window.__viewer = {get s(){ return s; }, get tx(){ return tx; }, get ty(){ return ty; }, get scales(){ return scalesOnPage; }, setView:setView, fit:fit};
})();
