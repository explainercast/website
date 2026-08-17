/* ==========================================================================
   Explainercast — force-directed background graph
   Nodes drift, connect to nearby neighbours, and flee the pointer. Edges that
   pass close to the pointer fade out, carving a "void" in the mesh.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('graph-canvas');
  if (!canvas || !canvas.getContext) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ctx = canvas.getContext('2d', { alpha: true });

  var PALETTE = [
    [79, 227, 255],   // cyan
    [123, 108, 255],  // indigo
    [255, 95, 162],   // pink
    [255, 203, 107]   // amber
  ];

  var CFG = {
    density: 1 / 15500,   // nodes per px²
    minNodes: 26,
    maxNodes: 108,
    link: 148,            // px: max edge length
    speed: 0.006,         // px per ms of idle drift
    repelRadius: 190,     // px: pointer influence
    repelForce: 0.26,
    voidRadius: 46,       // px: edges nearer than this to the pointer vanish
    homePull: 0.0011,     // spring back toward home so the mesh stays even
    friction: 0.968,
    maxSpeed: 0.09        // px per ms: velocity ceiling, keeps drift unhurried
  };

  var nodes = [];
  var W = 0, H = 0, dpr = 1;
  var pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
  var running = true;
  var last = 0;
  var rafId = null;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeNodes() {
    var target = Math.round(
      Math.min(CFG.maxNodes, Math.max(CFG.minNodes, W * H * CFG.density))
    );
    nodes = [];
    for (var i = 0; i < target; i++) {
      var x = rand(0, W);
      var y = rand(0, H);
      var hub = Math.random() < 0.16;             // a few "weighted" hub nodes
      var color = PALETTE[(Math.random() * PALETTE.length) | 0];
      nodes.push({
        x: x, y: y,
        hx: x, hy: y,
        vx: rand(-1, 1) * CFG.speed,
        vy: rand(-1, 1) * CFG.speed,
        r: hub ? rand(2.4, 3.6) : rand(0.9, 1.9),
        w: hub ? rand(0.75, 1) : rand(0.25, 0.6),  // weight -> edge brightness
        c: color,
        tw: rand(0, Math.PI * 2)                   // twinkle phase
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CFG.link = W < 700 ? 118 : 148;
    makeNodes();
  }

  /* distance from point p to segment ab, squared */
  function segDistSq(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len = dx * dx + dy * dy;
    var t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx - px;
    var qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }

  function step(dt) {
    // ease the pointer so motion feels weighted rather than twitchy
    pointer.x += (pointer.tx - pointer.x) * 0.14;
    pointer.y += (pointer.ty - pointer.y) * 0.14;

    var R = CFG.repelRadius;
    var R2 = R * R;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];

      if (pointer.active) {
        var dx = n.x - pointer.x;
        var dy = n.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var falloff = 1 - d / R;
          var push = falloff * falloff * CFG.repelForce * (1.3 - n.w * 0.5);
          n.vx += (dx / d) * push;
          n.vy += (dy / d) * push;
        }
      }

      // gentle spring toward home keeps the mesh from collapsing to the edges
      n.vx += (n.hx - n.x) * CFG.homePull;
      n.vy += (n.hy - n.y) * CFG.homePull;

      n.vx *= CFG.friction;
      n.vy *= CFG.friction;

      // clamp so a pointer sweep nudges rather than flings
      var sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (sp > CFG.maxSpeed) {
        n.vx = (n.vx / sp) * CFG.maxSpeed;
        n.vy = (n.vy / sp) * CFG.maxSpeed;
      }

      n.x += n.vx * dt;
      n.y += n.vy * dt;

      // soft walls
      if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx) * 0.6; }
      if (n.x > W) { n.x = W; n.vx = -Math.abs(n.vx) * 0.6; }
      if (n.y < 0) { n.y = 0; n.vy = Math.abs(n.vy) * 0.6; }
      if (n.y > H) { n.y = H; n.vy = -Math.abs(n.vy) * 0.6; }

      n.tw += dt * 0.0016;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    var link = CFG.link;
    var link2 = link * link;
    var voidR2 = CFG.voidRadius * CFG.voidRadius;
    var glowR = 240, glowR2 = glowR * glowR;

    // ---- edges
    ctx.lineCap = 'round';
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      for (var j = i + 1; j < nodes.length; j++) {
        var b = nodes[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy;
        if (d2 > link2) continue;

        var d = Math.sqrt(d2);
        var prox = 1 - d / link;
        var weight = (a.w + b.w) * 0.5;
        var alpha = prox * prox * 0.42 * (0.45 + weight);

        // edges give the pointer a wide berth
        if (pointer.active) {
          var sd2 = segDistSq(pointer.x, pointer.y, a.x, a.y, b.x, b.y);
          if (sd2 < voidR2) continue;
          if (sd2 < glowR2) alpha += (1 - Math.sqrt(sd2) / glowR) * 0.34;
        }
        if (alpha <= 0.004) continue;

        var c = a.w > b.w ? a.c : b.c;
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 0.5 + weight * 1.1 * prox;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ---- nodes
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var twinkle = 0.72 + Math.sin(n.tw) * 0.28;
      var near = 0;
      if (pointer.active) {
        var ndx = n.x - pointer.x, ndy = n.y - pointer.y;
        var nd2 = ndx * ndx + ndy * ndy;
        if (nd2 < glowR2) near = 1 - Math.sqrt(nd2) / glowR;
      }

      var rgb = n.c[0] + ',' + n.c[1] + ',' + n.c[2];
      var radius = n.r * (1 + near * 0.55);

      if (n.w > 0.7 || near > 0.35) {
        var halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 7);
        halo.addColorStop(0, 'rgba(' + rgb + ',' + (0.3 * twinkle + near * 0.3).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius * 7, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(' + rgb + ',' + Math.min(1, 0.5 * twinkle + near * 0.5).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    if (!running) return;
    var dt = last ? Math.min(time - last, 48) : 16;
    last = time;
    step(dt);
    draw();
  }

  /* --- input ------------------------------------------------------------ */
  function movePointer(x, y) {
    if (!pointer.active) { pointer.x = x; pointer.y = y; }
    pointer.tx = x;
    pointer.ty = y;
    pointer.active = true;
  }

  window.addEventListener('pointermove', function (e) {
    movePointer(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    movePointer(e.clientX, e.clientY);
    // a click sends a ripple through the mesh
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var dx = n.x - e.clientX, dy = n.y - e.clientY;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 320) {
        var f = (1 - d / 320) * 0.9;
        n.vx += (dx / d) * f;
        n.vy += (dy / d) * f;
      }
    }
  }, { passive: true });

  window.addEventListener('pointerleave', function () { pointer.active = false; });
  window.addEventListener('blur', function () { pointer.active = false; });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    last = 0;
  });

  /* --- boot ------------------------------------------------------------- */
  resize();

  if (reduce.matches) {
    draw();                     // one static frame, no motion
  } else {
    rafId = requestAnimationFrame(frame);
  }

  reduce.addEventListener && reduce.addEventListener('change', function (e) {
    if (e.matches) {
      cancelAnimationFrame(rafId);
      rafId = null;
      draw();
    } else if (!rafId) {
      last = 0;
      rafId = requestAnimationFrame(frame);
    }
  });
})();
