/* =========================================================
   Kurye Club oyun sesleri — kc-ses.js
   Bütün sesler telefonda anlık üretilir (WebAudio); ses dosyası yok,
   bu yüzden internet harcamaz ve oyunu yavaşlatmaz.

   Kullanım (oyun dosyasında):
     <script src="kc-ses.js"></script>
     KcSes.muzik('kelime');   // arka plan müziği (vardiya | mahalle | kelime | paket)
     KcSes.cal('dogru');      // efekt
   Sağ altta küçük bir düğme: 🔊 hepsi açık → 🎵 müzik kapalı → 🔇 sessiz
   ========================================================= */
(function () {
  'use strict';
  var KS = {};
  var ctx = null, ana = null, efektG = null, muzikG = null;
  var oku = function (k, v) { try { var x = localStorage.getItem(k); return x === null ? v : x; } catch (e) { return v; } };
  var yaz = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var mod = oku('kc-ses-mod', 'hepsi'); // hepsi | efekt | sessiz
  var muzikAd = null, muzikCalisiyor = false, zamanlayici = null, sonrakiVurus = 0, adim = 0;
  var durduruldu = false;

  function hazir() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      ana = ctx.createGain(); ana.gain.value = 0.9; ana.connect(ctx.destination);
      efektG = ctx.createGain(); efektG.gain.value = 0.55; efektG.connect(ana);
      muzikG = ctx.createGain(); muzikG.gain.value = 0.16; muzikG.connect(ana);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Tarayıcılar ses için ilk dokunuşu bekler
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (e) {
    window.addEventListener(e, function () {
      if (!hazir()) return;
      if (muzikAd && mod === 'hepsi' && !muzikCalisiyor && !durduruldu) baslat();
    }, { passive: true, capture: true });
  });

  /** Tek nota: frekans, süre (sn), dalga, ses, gecikme, bitiş frekansı (kayma) */
  function ton(f, sure, tip, ses, gec, f2, hedef) {
    if (!ctx) return;
    var t = ctx.currentTime + (gec || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tip || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + sure);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(ses || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g); g.connect(hedef || efektG);
    o.start(t); o.stop(t + sure + 0.02);
  }
  function gurultu(sure, ses, gec, filtre) {
    if (!ctx) return;
    var t = ctx.currentTime + (gec || 0);
    var n = Math.floor(ctx.sampleRate * sure), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ctx.createBufferSource(); s.buffer = b;
    var g = ctx.createGain(); g.gain.value = ses || 0.2;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filtre || 1800;
    s.connect(f); f.connect(g); g.connect(efektG); s.start(t);
  }

  var EFEKT = {
    tik: function () { ton(1200, 0.04, 'square', 0.08); },
    sec: function () { ton(660, 0.07, 'triangle', 0.25); ton(990, 0.09, 'triangle', 0.2, 0.05); },
    dogru: function () { ton(523, 0.1, 'triangle', 0.3); ton(659, 0.1, 'triangle', 0.3, 0.08); ton(784, 0.18, 'triangle', 0.3, 0.16); },
    yanlis: function () { ton(220, 0.18, 'sawtooth', 0.12, 0, 150); },
    para: function () { ton(988, 0.08, 'square', 0.14); ton(1319, 0.22, 'square', 0.14, 0.07); },
    yerlestir: function () { ton(180, 0.09, 'sine', 0.45, 0, 90); gurultu(0.06, 0.12, 0, 900); },
    dondur: function () { ton(500, 0.07, 'triangle', 0.18, 0, 750); },
    geri: function () { ton(600, 0.08, 'triangle', 0.16, 0, 380); },
    uyari: function () { ton(880, 0.12, 'square', 0.12); ton(660, 0.16, 'square', 0.12, 0.13); },
    korna: function () { ton(392, 0.22, 'sawtooth', 0.1); ton(466, 0.22, 'sawtooth', 0.08); },
    kapi: function () { ton(784, 0.25, 'sine', 0.25); ton(622, 0.35, 'sine', 0.25, 0.22); },
    gorev: function () { [523, 659, 784, 1047].forEach(function (f, i) { ton(f, 0.12, 'triangle', 0.25, i * 0.07); }); },
    bitir: function () {
      [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { ton(f, i === 5 ? 0.5 : 0.14, 'triangle', 0.28, i * 0.11); });
      ton(262, 0.7, 'sine', 0.2, 0.33);
    },
    kilit: function () { ton(330, 0.3, 'sine', 0.3); ton(247, 0.45, 'sine', 0.3, 0.25); }
  };
  KS.cal = function (ad) {
    if (mod === 'sessiz' || !EFEKT[ad]) return;
    if (!hazir()) return;
    try { EFEKT[ad](); } catch (e) {}
  };

  // ---------------- Müzik: oyuna göre küçük, tekrar eden ezgi ----------------
  // Notalar MIDI numarası; 0 = sus. 16 adımlık döngü.
  var PARCALAR = {
    vardiya: { tempo: 128, dalga: 'square', bas: [45, 0, 45, 0, 48, 0, 48, 0, 43, 0, 43, 0, 50, 0, 47, 0],
      ezgi: [69, 0, 72, 74, 76, 0, 74, 72, 67, 0, 69, 72, 74, 0, 71, 0] },
    mahalle: { tempo: 104, dalga: 'triangle', bas: [48, 0, 0, 55, 53, 0, 0, 52, 50, 0, 0, 55, 48, 0, 52, 0],
      ezgi: [72, 0, 76, 0, 79, 77, 76, 0, 74, 0, 77, 0, 76, 74, 72, 0] },
    kelime: { tempo: 84, dalga: 'sine', bas: [45, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0, 40, 0, 0, 0],
      ezgi: [76, 0, 79, 0, 81, 0, 79, 76, 72, 0, 74, 0, 76, 0, 0, 0] },
    paket: { tempo: 112, dalga: 'triangle', bas: [43, 0, 43, 50, 45, 0, 45, 52, 41, 0, 41, 48, 43, 0, 50, 0],
      ezgi: [67, 71, 74, 0, 72, 0, 71, 69, 65, 69, 72, 0, 71, 0, 67, 0] }
  };
  var hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function zamanla() {
    var p = PARCALAR[muzikAd]; if (!p || !ctx) return;
    var adimSure = 60 / p.tempo / 2;
    while (sonrakiVurus < ctx.currentTime + 0.25) {
      var i = adim % 16, gec = sonrakiVurus - ctx.currentTime;
      if (p.bas[i]) ton(hz(p.bas[i]), adimSure * 1.6, 'triangle', 0.5, gec, null, muzikG);
      if (p.ezgi[i]) ton(hz(p.ezgi[i]), adimSure * 0.9, p.dalga, 0.28, gec, null, muzikG);
      if (i % 4 === 0) ton(70, 0.08, 'sine', 0.35, gec, 40, muzikG); // hafif davul
      sonrakiVurus += adimSure; adim++;
    }
  }
  function baslat() {
    if (!hazir() || muzikCalisiyor || !PARCALAR[muzikAd]) return;
    muzikCalisiyor = true; adim = 0; sonrakiVurus = ctx.currentTime + 0.1;
    zamanlayici = setInterval(zamanla, 90);
  }
  function durdur() { muzikCalisiyor = false; clearInterval(zamanlayici); zamanlayici = null; }
  KS.muzik = function (ad) { muzikAd = ad; if (ctx && mod === 'hepsi' && !durduruldu) baslat(); };
  KS.muzikDurdur = function () { durdur(); };
  /** Oyun duraklayınca (hız kilidi, menü) müziği kes / sür */
  KS.duraklat = function (d) { durduruldu = !!d; if (d) durdur(); else if (mod === 'hepsi' && muzikAd) baslat(); };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { durdur(); if (ctx) ctx.suspend(); }
    else if (ctx) { ctx.resume(); if (mod === 'hepsi' && muzikAd && !durduruldu) baslat(); }
  });

  // ---------------- Ses düğmesi ----------------
  var ikon = { hepsi: '🔊', efekt: '🎵', sessiz: '🔇' };
  var etiket = { hepsi: 'Ses açık', efekt: 'Müzik kapalı', sessiz: 'Sessiz' };
  KS.dugme = function (konum) {
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'Ses');
    b.style.cssText = 'position:fixed;z-index:50;width:40px;height:40px;border-radius:50%;border:0;' +
      'background:rgba(29,27,46,.72);color:#fff;font-size:18px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);' +
      (konum || 'right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0))');
    var guncelle = function () { b.textContent = ikon[mod]; b.title = etiket[mod]; };
    b.onclick = function (e) {
      e.stopPropagation();
      mod = mod === 'hepsi' ? 'efekt' : mod === 'efekt' ? 'sessiz' : 'hepsi';
      yaz('kc-ses-mod', mod); guncelle();
      if (mod === 'hepsi') baslat(); else durdur();
      if (mod !== 'sessiz') KS.cal('tik');
      var t = document.createElement('div');
      t.textContent = etiket[mod];
      t.style.cssText = 'position:fixed;z-index:51;left:50%;top:70px;transform:translateX(-50%);background:rgba(29,27,46,.85);color:#fff;padding:6px 14px;border-radius:16px;font:700 14px system-ui;pointer-events:none';
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, 900);
    };
    guncelle();
    document.body.appendChild(b);
    return b;
  };
  window.KcSes = KS;
})();
