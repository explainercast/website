/* ==========================================================================
   Explainercast — interface behaviour (nav, player, niceties)
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- sticky nav + back-to-top ----------------------------------------- */
  var nav = document.querySelector('.nav');
  var toTop = document.querySelector('.to-top');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;

    if (nav) nav.classList.toggle('is-stuck', y > 12);
    if (toTop) toTop.classList.toggle('is-visible', y > 700);
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo(0, 0);
    });
  }

  /* --- card sheen follows the cursor ------------------------------------ */
  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(2) + '%');
    card.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(2) + '%');
  }, { passive: true });

  /* --- hero artwork parallax tilt --------------------------------------- */
  var art = document.querySelector('.art-card');
  var stage = document.querySelector('.hero__art');
  if (art && stage && !reduce && window.matchMedia('(hover: hover)').matches) {
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      art.style.transform =
        'rotateY(' + (px * 16).toFixed(2) + 'deg) rotateX(' + (-py * 14).toFixed(2) + 'deg) translateZ(0)';
    }, { passive: true });

    stage.addEventListener('pointerleave', function () {
      art.style.transform = '';
    });
  }

  /* --- toast ------------------------------------------------------------- */
  var toast = document.querySelector('.toast');
  var toastTimer;
  function say(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2200);
  }

  /* --- copy the feed url ------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.copy-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy') || '';
      var done = function () {
        btn.classList.add('is-done');
        say('Feed URL copied to clipboard');
        setTimeout(function () { btn.classList.remove('is-done'); }, 1800);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { say(text); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { say(text); }
        document.body.removeChild(ta);
      }
    });
  });

  /* --- audio players ---------------------------------------------------- */
  function fmt(secs) {
    if (!isFinite(secs) || secs < 0) return '--:--';
    var s = Math.floor(secs % 60);
    var m = Math.floor(secs / 60) % 60;
    var h = Math.floor(secs / 3600);
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
  }

  var players = [];

  Array.prototype.forEach.call(document.querySelectorAll('.audio-player'), function (shell) {
    var audio = shell.querySelector('audio');
    var ui = shell.querySelector('.ap');
    if (!audio || !ui) return;

    var playBtn = ui.querySelector('.ap__play');
    var scrub = ui.querySelector('.ap__scrub');
    var fill = ui.querySelector('.ap__fill');
    var buffer = ui.querySelector('.ap__buffer');
    var knob = ui.querySelector('.ap__knob');
    var cur = ui.querySelector('.ap__current');
    var dur = ui.querySelector('.ap__duration');

    // hand control to the custom UI only once we know scripting works
    audio.removeAttribute('controls');
    shell.classList.add('is-enhanced');
    players.push(audio);

    function paint() {
      var d = audio.duration;
      var pct = d ? (audio.currentTime / d) * 100 : 0;
      fill.style.width = pct + '%';
      knob.style.left = pct + '%';
      if (cur) cur.textContent = fmt(audio.currentTime);
      if (dur && d) dur.textContent = fmt(d);
    }

    playBtn.addEventListener('click', function () {
      if (audio.paused) {
        players.forEach(function (other) { if (other !== audio) other.pause(); });
        audio.play().catch(function () { /* autoplay policy / network */ });
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', function () {
      ui.classList.add('is-playing');
      playBtn.setAttribute('aria-label', 'Pause episode');
    });
    audio.addEventListener('pause', function () {
      ui.classList.remove('is-playing');
      playBtn.setAttribute('aria-label', 'Play episode');
    });
    audio.addEventListener('ended', function () { ui.classList.remove('is-playing'); });
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('durationchange', paint);

    audio.addEventListener('progress', function () {
      if (!audio.buffered.length || !audio.duration) return;
      var end = audio.buffered.end(audio.buffered.length - 1);
      buffer.style.width = ((end / audio.duration) * 100) + '%';
    });

    // seeking (pointer drag anywhere on the track)
    var dragging = false;
    function seekTo(clientX) {
      var r = scrub.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      if (audio.duration) {
        audio.currentTime = ratio * audio.duration;
      } else {
        fill.style.width = knob.style.left = (ratio * 100) + '%';
      }
    }

    scrub.addEventListener('pointerdown', function (e) {
      dragging = true;
      scrub.setPointerCapture && scrub.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
    });
    scrub.addEventListener('pointermove', function (e) {
      if (dragging) seekTo(e.clientX);
    });
    scrub.addEventListener('pointerup', function () { dragging = false; });
    scrub.addEventListener('pointercancel', function () { dragging = false; });

    scrub.addEventListener('keydown', function (e) {
      if (!audio.duration) return;
      if (e.key === 'ArrowRight') { audio.currentTime += 10; e.preventDefault(); }
      if (e.key === 'ArrowLeft') { audio.currentTime -= 10; e.preventDefault(); }
    });

    paint();
  });
})();
