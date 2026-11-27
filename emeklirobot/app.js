(function () {
  'use strict';

  var TIP = {
    SARJ_BASLADI: 'Şarj başladı (kontak açıldı)', SARJ_KESILDI: 'Şarj kesildi (kontak kapandı)',
    ARAC_HAREKET: 'Araç harekete geçti', ARAC_DURUYOR: 'Araç durdu', KONUM: 'Konum (hareketli)',
    DURUM: 'Durum (durağan)', KONUM_ALINAMADI: 'Konum alınamadı', CIHAZ_ISINDI: 'Cihaz ısındı (≥45°C)',
    CIHAZ_KRITIK_ISINDI: 'Cihaz kritik ısındı (≥48°C)', CIHAZ_SOGUDU: 'Cihaz soğudu'
  };
  var $ = function (id) { return document.getElementById(id); };
  var durum = { sonId: null, kayitlar: [], sonKonum: null, secili: null, elle: false, secenekGeldi: false, tipler: Object.keys(TIP), cihazlar: [] };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function zaman(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? esc(iso) : fmt.format(d); }
  function istYerel(ms) { return new Date(ms + 3 * 3600e3).toISOString().slice(0, 16); } // Türkiye UTC+3 sabit
  function yerelIso(v) {
    if (!v) return '';
    if (v.length === 16) v += ':00';
    var d = new Date(v + '+03:00');
    return isNaN(d) ? '' : d.toISOString();
  }
  function evetHayir(v, e, h) { return v === null || v === undefined ? '—' : (v ? e : h); }

  /* ---------- Harita ---------- */
  var harita = L.map('harita').setView([41.0082, 28.9784], 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(harita);
  var katman = L.layerGroup().addTo(harita);
  var pin = null;
  var pinIcon = L.divIcon({
    className: 'pin', iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34],
    html: '<svg width="28" height="38" viewBox="0 0 28 38"><path d="M14 1C6.8 1 1 6.8 1 14c0 9.5 13 23 13 23s13-13.5 13-23C27 6.8 21.2 1 14 1z" fill="#d93025" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>'
  });
  window.addEventListener('resize', function () { harita.invalidateSize(); });
  function detayAcKapa(ac) {
    $('ana').classList.toggle('detay-kapali', !ac);
    $('detay-ac').setAttribute('aria-expanded', ac ? 'true' : 'false');
    var bit = function () { harita.invalidateSize(); };
    $('ana').addEventListener('transitionend', bit, { once: true });
    setTimeout(bit, 400);
  }
  $('detay-ac').addEventListener('click', function () { detayAcKapa(true); });
  $('detay-kapat').addEventListener('click', function () { detayAcKapa(false); });

  function kayitBul(id) {
    if (durum.sonKonum && durum.sonKonum.id === id) return durum.sonKonum;
    for (var i = 0; i < durum.kayitlar.length; i++) if (durum.kayitlar[i].id === id) return durum.kayitlar[i];
    return null;
  }
  function konumlu(k) { return k && k.enlem !== null && k.boylam !== null; }

  function ozetHtml(k) {
    return '<strong>' + esc(TIP[k.logTipi] || k.logTipi) + '</strong><br>' + zaman(k.zaman) +
      '<br>Pil: ' + (k.pilYuzdesi === null ? '—' : k.pilYuzdesi + '%') + ' · ' + (k.pilSicakligi === null ? '—' : k.pilSicakligi + '°C');
  }

  function sec(id, haritayiKaydir) {
    var k = kayitBul(id);
    if (!k) return;
    durum.secili = id;
    [].forEach.call(document.querySelectorAll('#liste tbody tr'), function (tr) {
      tr.classList.toggle('secili', Number(tr.getAttribute('data-id')) === id);
    });
    detayYaz(k);
    if (pin) { harita.removeLayer(pin); pin = null; }
    if (konumlu(k)) {
      pin = L.marker([k.enlem, k.boylam], { icon: pinIcon, zIndexOffset: 1000 }).addTo(harita).bindPopup(ozetHtml(k));
      pin.on('click', function () { detayYaz(k); });
      if (haritayiKaydir) harita.panTo([k.enlem, k.boylam]);
    }
  }

  function detayYaz(k) {
    var satirlar = [
      ['Zaman (düzeltilmiş)', zaman(k.zaman)],
      ['Log tipi', esc(k.logTipi) + '<br><small>' + esc(TIP[k.logTipi] || '') + '</small>'],
      ['Cihaz', esc(k.cihazAdi)],
      ['Konum', konumlu(k) ? k.enlem.toFixed(6) + ', ' + k.boylam.toFixed(6) + ' <a href="https://www.google.com/maps?q=' + k.enlem + ',' + k.boylam + '" target="_blank" rel="noopener noreferrer">Google Maps</a>' : '<span class="rozet yok">Konum yok</span>'],
      ['Doğruluk', k.dogruluk === null ? '—' : k.dogruluk + ' m'],
      ['Hız', k.hizKmh === null ? '—' : k.hizKmh + ' km/h'],
      ['Yön', k.yon === null ? '—' : k.yon + '°' + (k.hizKmh !== null && k.hizKmh <= 2 ? ' <small>(düşük hız, anlamsız olabilir)</small>' : '')],
      ['Pil', k.pilYuzdesi === null ? '—' : '%' + k.pilYuzdesi],
      ['Pil sıcaklığı', k.pilSicakligi === null ? '—' : k.pilSicakligi + ' °C'],
      ['Şarj / kontak', evetHayir(k.sarjdaMi, 'Şarjda (kontak açık)', 'Şarjda değil')],
      ['Araç', evetHayir(k.aracHareketli, 'Hareketli', 'Durağan')],
      ['Cihaz saati', zaman(k.konumZamani)],
      ['Konum süresi', sureYaz(k.konumYasiMs)],
      ['Zaman kaynağı', esc(k.zamanKaynagi) + ' <small>(ELAPSED: sunucuya göre düzeltildi, CIHAZ: yedek, YOK: düzeltme yok)</small>'],
      ['Sunucuya ulaştı', zaman(k.alinmaZamani)],
      ['elapsedRealtime', k.elapsedRealtime + ' ms'],
      ['Kayıt UUID', '<small>' + esc(k.kayit) + '</small>'],
      ['Sıra no', k.id]
    ];
    $('detay').innerHTML = '<h3>Log detayı</h3><dl>' + satirlar.map(function (s) { return '<dt>' + s[0] + '</dt><dd>' + s[1] + '</dd>'; }).join('') + '</dl>';
  }

  /* ---------- Liste ---------- */
  function tarih(iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d) ? null : d; }
  function sayiYaz(v, n) { return v == null ? '—' : (n === undefined ? v : v.toFixed(n)); }
  function ehx(v, e, h) { return v === null || v === undefined ? null : (v ? e : h); }
  function sureYaz(ms) { if (ms === null || ms === undefined) return '—'; var t = Math.floor(ms / 1000), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(Math.floor(t / 3600)) + ':' + p(Math.floor(t % 3600 / 60)) + ':' + p(t % 60); }
  var COLS = [
    { b: 'Sıra no', w: 9, html: function (k) { return k.id; }, xl: function (k) { return k.id; } },
    { b: 'Zaman (düzeltilmiş)', w: 20, html: function (k) { return zaman(k.zaman); }, xl: function (k) { return tarih(k.zaman); } },
    { b: 'Log tipi', w: 22, html: function (k) { return esc(k.logTipi); }, xl: function (k) { return k.logTipi; } },
    { b: 'Cihaz', w: 15, html: function (k) { return esc(k.cihazAdi); }, xl: function (k) { return k.cihazAdi; } },
    { b: 'Enlem', w: 12, html: function (k) { return sayiYaz(k.enlem, 6); }, xl: function (k) { return k.enlem; } },
    { b: 'Boylam', w: 12, html: function (k) { return sayiYaz(k.boylam, 6); }, xl: function (k) { return k.boylam; } },
    { b: 'Doğruluk (m)', w: 13, html: function (k) { return sayiYaz(k.dogruluk); }, xl: function (k) { return k.dogruluk; } },
    { b: 'Hız (km/sa)', w: 12, html: function (k) { return sayiYaz(k.hizKmh); }, xl: function (k) { return k.hizKmh; } },
    { b: 'Yön (°)', w: 9, html: function (k) { return sayiYaz(k.yon); }, xl: function (k) { return k.yon; } },
    { b: 'Pil %', w: 8, html: function (k) { return sayiYaz(k.pilYuzdesi); }, xl: function (k) { return k.pilYuzdesi; } },
    { b: 'Pil sıcaklığı (°C)', w: 16, html: function (k) { return k.pilSicakligi === null ? '—' : '<span class="rozet' + (k.pilSicakligi >= 48 ? ' kritik' : k.pilSicakligi >= 45 ? ' sicak' : '') + '">' + k.pilSicakligi + '</span>'; }, xl: function (k) { return k.pilSicakligi; } },
    { b: 'Şarj/kontak', w: 12, html: function (k) { return evetHayir(k.sarjdaMi, 'Evet', 'Hayır'); }, xl: function (k) { return ehx(k.sarjdaMi, 'Evet', 'Hayır'); } },
    { b: 'Araç', w: 11, html: function (k) { return evetHayir(k.aracHareketli, 'Hareketli', 'Durağan'); }, xl: function (k) { return ehx(k.aracHareketli, 'Hareketli', 'Durağan'); } },
    { b: 'Cihaz saati', w: 20, html: function (k) { return zaman(k.konumZamani); }, xl: function (k) { return tarih(k.konumZamani); } },
    { b: 'Konum Süresi', w: 14, html: function (k) { return sureYaz(k.konumYasiMs); }, xl: function (k) { return sureYaz(k.konumYasiMs); } },
    { b: 'Sunucuya ulaştı', w: 20, html: function (k) { return zaman(k.alinmaZamani); }, xl: function (k) { return tarih(k.alinmaZamani); } }
  ];
  document.querySelector('#liste thead').innerHTML = '<tr>' + COLS.map(function (c) { return '<th>' + esc(c.b) + '</th>'; }).join('') + '</tr>';

  function listeYaz() {
    var tb = document.querySelector('#liste tbody');
    if (!durum.kayitlar.length) { tb.innerHTML = '<tr><td colspan="' + COLS.length + '" class="bos">Kayıt bulunamadı.</td></tr>'; return; }
    tb.innerHTML = durum.kayitlar.map(function (k) {
      return '<tr data-id="' + k.id + '" class="t-' + esc(k.logTipi) + (k.id === durum.secili ? ' secili' : '') + '">' + COLS.map(function (c) { return '<td>' + c.html(k) + '</td>'; }).join('') + '</tr>';
    }).join('');
  }
  document.querySelector('#liste tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    durum.elle = true;
    sec(Number(tr.getAttribute('data-id')), true);
  });

  /* ---------- Yön okları ---------- */
  var oklar = [];
  function yon(a, b) { // kuzeyden saat yönünde derece (Mercator'da ekran açısı ile aynı)
    var r = Math.PI / 180, dl = (b[1] - a[1]) * r, f1 = a[0] * r, f2 = b[0] * r;
    var y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function okIcon(deg, renk) {
    return L.divIcon({
      className: 'ok', iconSize: [16, 16], iconAnchor: [8, 8],
      html: '<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(' + deg.toFixed(1) + 'deg)"><path d="M8 1l5.5 13L8 11l-5.5 3z" fill="' + renk + '" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>'
    });
  }
  function oklariGuncelle() { // iki nokta ekranda birbirine çok yakınsa oku gizle (karmaşayı önler)
    oklar.forEach(function (o) {
      var el = o.m.getElement(); if (!el) return;
      el.style.display = harita.latLngToContainerPoint(o.a).distanceTo(harita.latLngToContainerPoint(o.b)) < 22 ? 'none' : '';
    });
  }
  harita.on('zoomend', oklariGuncelle);

  /* ---------- Cihaz kutusu (haritada sağ üst) ---------- */
  var PALET = ['#2563eb', '#f59e0b', '#16a34a', '#9333ea', '#0d9488', '#db2777', '#92400e', '#475569'];
  var renkler = {}, gorunur = {}, paletAcik = null;
  try { renkler = JSON.parse(localStorage.getItem('er_renkler') || '{}') || {}; } catch (e) { renkler = {}; }
  function renkKaydet() { try { localStorage.setItem('er_renkler', JSON.stringify(renkler)); } catch (e) {} }
  function renkOf(ad) { if (!renkler[ad]) renkler[ad] = PALET[Object.keys(renkler).length % PALET.length]; return renkler[ad]; }
  var HEX = /^#[0-9a-f]{6}$/i;
  var CihazKutusu = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      var d = L.DomUtil.create('div', 'cihaz-kutu');
      d.id = 'cihaz-kutu';
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      d.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-nokta],[data-renk]') : null;
        if (!t) return;
        e.preventDefault();
        if (t.hasAttribute('data-nokta')) { var ad = t.getAttribute('data-nokta'); paletAcik = paletAcik === ad ? null : ad; cihazKutusuYaz(); return; }
        var c = t.getAttribute('data-renk'), cad = t.getAttribute('data-cihaz');
        if (!HEX.test(c)) return;
        renkler[cad] = c; renkKaydet(); paletAcik = null;
        if (anim.araclar[cad]) { anim.katman.removeLayer(anim.araclar[cad]); delete anim.araclar[cad]; }
        noktalariCiz(false);
      });
      d.addEventListener('change', function (e) {
        var i = e.target.closest ? e.target.closest('input[data-cihaz]') : null;
        if (!i) return;
        gorunur[i.getAttribute('data-cihaz')] = i.checked;
        noktalariCiz(false);
      });
      return d;
    }
  });
  new CihazKutusu().addTo(harita);

  function cihazKutusuYaz() {
    var adlar = birlestir(durum.cihazlar || [], durum.kayitlar.map(function (k) { return k.cihazAdi; }));
    adlar.sort(function (x, y) { return x < y ? -1 : x > y ? 1 : 0; }); // asc, distinct
    adlar.forEach(function (ad) { if (!HEX.test(renkler[ad] || '')) delete renkler[ad]; renkOf(ad); if (gorunur[ad] === undefined) gorunur[ad] = true; });
    $('cihaz-kutu').innerHTML = '<div class="cihaz-baslik">Cihazlar</div>' + (adlar.length ? adlar.map(function (ad) {
      var palet = paletAcik === ad ? '<div class="cihaz-palet">' + PALET.map(function (c) {
        return '<button type="button" class="renk' + (c.toLowerCase() === String(renkler[ad]).toLowerCase() ? ' sec' : '') + '" data-renk="' + c + '" data-cihaz="' + esc(ad) + '" style="background:' + c + '" title="' + c + '"></button>';
      }).join('') + '</div>' : '';
      return '<div class="cihaz-satir"><button type="button" class="cihaz-nokta" data-nokta="' + esc(ad) + '" style="background:' + renkler[ad] + '" title="Rengi değiştir"></button><label class="cihaz-sw"><span class="cihaz-ad">' + esc(ad) +
        '</span><input type="checkbox" class="anahtar" data-cihaz="' + esc(ad) + '"' + (gorunur[ad] ? ' checked' : '') + '><i></i></label></div>' + palet;
    }).join('') : '<div class="cihaz-bos">Cihaz yok</div>');
  }

  /* ---------- Harita noktaları ---------- */
  function noktalariCiz(sigdir) {
    katman.clearLayers();
    cihazKutusuYaz();
    var gruplar = {}, tum = [];
    durum.kayitlar.slice().reverse().forEach(function (k) { // eskiden yeniye
      if (!konumlu(k) || gorunur[k.cihazAdi] === false) return;
      (gruplar[k.cihazAdi] = gruplar[k.cihazAdi] || []).push(k);
    });
    oklar = [];
    Object.keys(gruplar).sort().forEach(function (ad) {
      var renk = renkler[ad], pts = [];
      gruplar[ad].forEach(function (k) {
        pts.push([k.enlem, k.boylam]); tum.push([k.enlem, k.boylam]);
        L.circleMarker([k.enlem, k.boylam], { radius: 5, weight: 1, color: '#fff', fillColor: renk, fillOpacity: .9 })
          .addTo(katman).on('click', function () { durum.elle = true; sec(k.id, false); });
      });
      if (pts.length > 1) L.polyline(pts, { color: renk, weight: 2, opacity: .45 }).addTo(katman);
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        var m = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: okIcon(yon(a, b), renk), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(katman);
        oklar.push({ m: m, a: a, b: b });
      }
    });
    oklariGuncelle();
    animHazirla(gruplar);
    if (sigdir && tum.length > 1) harita.fitBounds(tum, { maxZoom: 16, padding: [30, 30] });
  }

  /* ---------- Rota animasyonu (cihaz başına eskiden yeniye) ---------- */
  var anim = { izler: {}, pos: 0, max: 0, oynuyor: false, son: 0, araclar: {}, katman: L.layerGroup().addTo(harita) };
  function aracIcon(renk) {
    return L.divIcon({
      className: 'arac', iconSize: [30, 30], iconAnchor: [15, 15],
      html: '<div class="arac-i"><svg width="30" height="30" viewBox="0 0 30 30"><path d="M15 0l4.5 6h-9z" fill="' + renk + '"/><rect x="8" y="5" width="14" height="23" rx="6" fill="' + renk + '" stroke="#fff" stroke-width="1.5"/><rect x="10.5" y="9" width="9" height="5" rx="1.5" fill="#fff" opacity=".85"/><rect x="10.5" y="20" width="9" height="4" rx="1.5" fill="#fff" opacity=".6"/></svg></div>'
    });
  }
  function animHazirla(gruplar) {
    anim.izler = {}; anim.max = 0;
    Object.keys(gruplar).sort().forEach(function (ad) {
      anim.izler[ad] = { kayitlar: gruplar[ad], yon: 0 };
      anim.max = Math.max(anim.max, gruplar[ad].length - 1);
    });
    Object.keys(anim.araclar).forEach(function (ad) { if (!anim.izler[ad]) { anim.katman.removeLayer(anim.araclar[ad]); delete anim.araclar[ad]; } });
    var var_ = anim.max >= 1;
    ['a-oynat', 'a-sifirla', 'a-kaydir'].forEach(function (id) { $(id).disabled = !var_; });
    if (!var_) { animDurdur(); anim.pos = 0; }
    if (anim.pos > anim.max) anim.pos = anim.max;
    animCiz();
  }
  function animCiz() {
    var adlar = Object.keys(anim.izler), ilk = null, bilgi = '';
    adlar.forEach(function (ad) {
      var iz = anim.izler[ad], ks = iz.kayitlar, n = ks.length;
      var i = Math.min(Math.floor(anim.pos), n - 1), f = i >= n - 1 ? 0 : anim.pos - i;
      var a = ks[i], b = ks[Math.min(i + 1, n - 1)];
      var ll = [a.enlem + (b.enlem - a.enlem) * f, a.boylam + (b.boylam - a.boylam) * f];
      if (a.enlem !== b.enlem || a.boylam !== b.boylam) iz.yon = yon([a.enlem, a.boylam], [b.enlem, b.boylam]);
      var m = anim.araclar[ad];
      if (!m) { m = anim.araclar[ad] = L.marker(ll, { icon: aracIcon(renkOf(ad)), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(anim.katman); }
      m.setLatLng(ll);
      var el = m.getElement(); if (el && el.firstChild) el.firstChild.style.transform = 'rotate(' + iz.yon.toFixed(1) + 'deg)';
      if (!ilk) ilk = ll;
      bilgi += (adlar.length > 1 ? ad + ': ' : '') + zaman(a.zaman) + ' (' + (i + 1) + '/' + n + ')' + (adlar.length > 1 ? '  ' : '');
    });
    $('a-bilgi').textContent = adlar.length ? bilgi : '—';
    $('a-kaydir').value = anim.max ? Math.round(anim.pos / anim.max * 1000) : 0;
    if (ilk && $('a-takip').checked && anim.oynuyor) harita.panTo(ilk, { animate: false });
  }
  function animAdim(t) {
    if (!anim.oynuyor) return;
    anim.pos += Math.max(0, t - anim.son) / 1000 * Number($('a-hiz').value); anim.son = t;
    if (anim.pos >= anim.max) { anim.pos = anim.max; animDurdur(); }
    animCiz();
    if (anim.oynuyor) requestAnimationFrame(animAdim);
  }
  function animBaslat() {
    if (anim.max < 1) return;
    if (anim.pos >= anim.max) anim.pos = 0;
    anim.oynuyor = true; anim.son = performance.now(); $('a-oynat').textContent = '⏸ Duraklat';
    requestAnimationFrame(animAdim);
  }
  function animDurdur() { anim.oynuyor = false; $('a-oynat').textContent = '▶ Başlat'; }
  $('a-oynat').addEventListener('click', function () { if (anim.oynuyor) animDurdur(); else animBaslat(); });
  $('a-sifirla').addEventListener('click', function () { animDurdur(); anim.pos = 0; animCiz(); });
  $('a-kaydir').addEventListener('input', function () { anim.pos = Number(this.value) / 1000 * anim.max; animCiz(); });

  /* ---------- Filtreler ---------- */
  function cipler(kap, degerler, aciklama) {
    var secili = secilenler(kap);
    $(kap).innerHTML = degerler.map(function (v) {
      var a = secili.indexOf(v) >= 0;
      return '<label class="cip' + (a ? ' acik' : '') + '" title="' + esc(aciklama ? (aciklama[v] || '') : '') + '"><input type="checkbox" value="' + esc(v) + '"' + (a ? ' checked' : '') + '>' + esc(v) + '</label>';
    }).join('');
  }
  function secilenler(kap) {
    return [].map.call($(kap).querySelectorAll('input:checked'), function (i) { return i.value; });
  }
  function birlestir(a, b) { var s = a.slice(); b.forEach(function (x) { if (s.indexOf(x) < 0) s.push(x); }); return s; }

  function sorgu(secenek) {
    var q = new URLSearchParams();
    var bas = yerelIso($('f-bas').value), bit = yerelIso($('f-bit').value);
    if (bas) q.set('bas', bas);
    if (bit) q.set('bit', bit);
    var t = secilenler('f-tipler'); if (t.length) q.set('tip', t.join(','));
    var c = secilenler('f-cihazlar'); if (c.length) q.set('cihaz', c.join(','));
    ['hareket', 'sarj', 'pilMin', 'pilMax', 'sicMin', 'sicMax', 'dogMax'].forEach(function (a) { var v = $('f-' + a).value; if (v !== '') q.set(a, v); });
    if ($('f-konumlu').checked) q.set('konumlu', '1');
    q.set('limit', $('f-limit').value);
    if (secenek) q.set('secenek', '1');
    return q.toString();
  }

  // Hızlı butonlara, diğer filtrelerle birlikte kaç kayıt getireceklerini yazar: "Son 15 dk (7)"
  function hizliSayilar(s) {
    if (!s) return;
    [].forEach.call(document.querySelectorAll('.hizli button'), function (b) {
      var saat = b.getAttribute('data-saat');
      var ad = b.hasAttribute('data-dk') ? 'dk' + b.getAttribute('data-dk') : (saat === 'bugun' ? 'bugun' : 's' + saat);
      if (!b.hasAttribute('data-ad')) b.setAttribute('data-ad', b.textContent);
      if (typeof s[ad] === 'number') b.textContent = b.getAttribute('data-ad') + ' (' + (s[ad] > 999 ? '999+' : s[ad]) + ')';
    });
  }

  // Tam ekran yükleme perdesi (sayfa HTML'de görünür başlar). Yanıp sönmesin diye en az 400 ms kalır.
  var YK_ENAZ = 400, ykBas = Date.now(), ykTm = null;
  function ykGoster() { clearTimeout(ykTm); if ($('yukleniyor').hidden) { ykBas = Date.now(); $('yukleniyor').hidden = false; } }
  function ykGizle() { clearTimeout(ykTm); ykTm = setTimeout(function () { $('yukleniyor').hidden = true; }, Math.max(0, YK_ENAZ - (Date.now() - ykBas))); }

  var istek = 0;
  function yukle(opts) {
    opts = opts || {};
    var no = ++istek;
    $('durum').textContent = 'Yükleniyor…';
    // Açık bir pencere varken (Anlık Durum / DB Ayarları) otomatik yenileme pencerenin üstünü kapatmasın
    if (!(opts.oto && document.querySelector('.modal:not([hidden])'))) ykGoster();
    // Yanıt gelmezse perde ekranı kilitli bırakmasın: 30 sn'de istek iptal edilir
    var iptal = window.AbortController ? new AbortController() : null;
    var sure = iptal ? setTimeout(function () { iptal.abort(); }, 30000) : null;
    function bitti() { clearTimeout(sure); if (no === istek) ykGizle(); }
    fetch('/emeklirobot/api.php?' + sorgu(!durum.secenekGeldi), { credentials: 'same-origin', cache: 'no-store', signal: iptal ? iptal.signal : undefined })
      .then(function (r) { if (r.status === 401) { location.reload(); throw new Error('oturum'); } return r.json(); })
      .then(function (v) {
        if (no !== istek) return;
        if (!v.ok) throw new Error('sunucu');
        if (v.tipler) { durum.secenekGeldi = true; durum.tipler = birlestir(Object.keys(TIP), v.tipler); durum.cihazlar = v.cihazlar; cipler('f-tipler', durum.tipler, TIP); cipler('f-cihazlar', durum.cihazlar); }
        var maxId = v.kayitlar.reduce(function (m, k) { return k.id > m ? k.id : m; }, 0), yeni = 0;
        if (opts.oto && durum.sonId !== null) {
          v.kayitlar.forEach(function (k) { if (k.id > durum.sonId) yeni++; });
          if (yeni > 0) ses();
          durum.sonId = Math.max(durum.sonId, maxId);
        } else { durum.sonId = maxId; }
        durum.kayitlar = v.kayitlar; durum.sonKonum = v.sonKonum;
        hizliSayilar(v.hizli);
        $('sayac').textContent = v.toplam + ' kayıt eşleşti, ilk ' + v.kayitlar.length + ' tanesi listeleniyor';
        $('durum').textContent = 'Güncellendi: ' + zaman(v.sunucuZamani) + (yeni ? ' · ' + yeni + ' yeni kayıt' : '');
        // seçili kayıt yeni listede yoksa ya da kullanıcı seçim yapmadıysa en son konuma dön
        var hedef = (opts.sifirla || !durum.elle || !kayitBul(durum.secili)) ? (v.sonKonum ? v.sonKonum.id : (v.kayitlar[0] ? v.kayitlar[0].id : null)) : durum.secili;
        if (opts.sifirla) durum.elle = false;
        listeYaz();
        noktalariCiz(opts.sigdir);
        if (hedef !== null) {
          sec(hedef, false);
          var k = kayitBul(hedef);
          if (konumlu(k) && (opts.ilk || (opts.sifirla && (!opts.sigdir || durum.kayitlar.filter(konumlu).length < 2)))) harita.setView([k.enlem, k.boylam], 15);
        } else {
          if (pin) { harita.removeLayer(pin); pin = null; }
          $('detay').innerHTML = '<p class="bos">Kayıt bulunamadı.</p>';
        }
      })
      .catch(function (e) { if (e && e.message !== 'oturum') $('durum').textContent = 'Veri alınamadı.'; })
      .then(bitti);
  }

  var zamanlayici = null;
  function gecikmeliYukle() { clearTimeout(zamanlayici); zamanlayici = setTimeout(function () { yukle({ sifirla: true, sigdir: true }); }, 350); }

  $('filtre').addEventListener('change', function (e) {
    var cip = e.target.closest && e.target.closest('.cip');
    if (cip) cip.classList.toggle('acik', e.target.checked);
    gecikmeliYukle();
  });
  $('filtre').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); gecikmeliYukle(); } });
  $('b-uygula').addEventListener('click', gecikmeliYukle);

  document.querySelector('.hizli').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-saat],button[data-dk]'); if (!b) return;
    var s = b.getAttribute('data-saat'), simdi = Date.now();
    if (s === 'bugun') $('f-bas').value = istYerel(simdi).slice(0, 10) + 'T00:00';
    else if (b.hasAttribute('data-dk')) $('f-bas').value = istYerel(simdi - Number(b.getAttribute('data-dk')) * 60e3);
    else $('f-bas').value = istYerel(simdi - Number(s) * 3600e3);
    $('f-bit').value = '';
    gecikmeliYukle();
  });

  $('b-temizle').addEventListener('click', function () {
    ['f-bas', 'f-bit', 'f-hareket', 'f-sarj', 'f-pilMin', 'f-pilMax', 'f-sicMin', 'f-sicMax', 'f-dogMax'].forEach(function (id) { $(id).value = ''; });
    $('f-konumlu').checked = false;
    [].forEach.call(document.querySelectorAll('#f-tipler input, #f-cihazlar input'), function (i) { i.checked = false; i.closest('.cip').classList.remove('acik'); });
    clearTimeout(zamanlayici);
    yukle({ sifirla: true, sigdir: false });
  });

  $('f-limit').addEventListener('change', function () { yukle({}); });

  $('b-excel').addEventListener('click', function (e) {
    e.preventDefault();
    if (!durum.kayitlar.length) { alert('İndirilecek kayıt yok.'); return; }
    var blob = Xlsx.blob(COLS.map(function (c) { return c.b; }), durum.kayitlar.map(function (k) { return COLS.map(function (c) { return c.xl(k); }); }), COLS.map(function (c) { return c.w; }), 'Loglar');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'emekli-robot-' + istYerel(Date.now()).replace(/[-:T]/g, '').slice(0, 12) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  });


  /* ---------- DB Ayarları (silme) ---------- */
  var KURAL_AD = { bugun: 'Bugüne ait', hafta: '1 haftadan eski', ay: '1 aydan eski', hepsi: 'TÜM' };
  var bekleyen = null, mesgul = false;
  function bayt(n) {
    if (n < 1024) return n + ' B';
    var b = ['KB', 'MB', 'GB', 'TB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < b.length - 1);
    return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) + ' ' + b[i];
  }
  function dbMesaj(t, tur) { var m = $('db-mesaj'); m.textContent = t || ''; m.className = 'mesaj' + (tur ? ' ' + tur : ''); }
  function dbIstek(url, govde) {
    var o = { credentials: 'same-origin', cache: 'no-store' };
    if (govde) { o.method = 'POST'; o.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': document.body.getAttribute('data-csrf') }; o.body = JSON.stringify(govde); }
    return fetch(url, o).then(function (r) {
      if (r.status === 401) { location.reload(); throw new Error('oturum'); }
      return r.json();
    });
  }
  function dbBilgi() {
    return dbIstek('/emeklirobot/db.php?islem=bilgi').then(function (v) {
      if (!v.ok) throw new Error('bilgi');
      $('db-toplam').textContent = v.toplam.toLocaleString('tr-TR');
      $('db-boyut').textContent = bayt(v.boyutBayt);
      $('db-boyut').title = 'Veri: ' + bayt(v.veriBayt) + ' · İndeks: ' + bayt(v.indeksBayt);
      $('db-eski').textContent = zaman(v.enEski);
      $('db-yeni').textContent = zaman(v.enYeni);
    }).catch(function (e) { if (e.message !== 'oturum') dbMesaj('İstatistik alınamadı.', 'hata'); });
  }
  function dbAna() { $('db-ana').hidden = false; $('db-onay').hidden = true; bekleyen = null; }
  function dbAc() { $('dbmodal').hidden = false; dbMesaj(''); dbAna(); ['db-toplam', 'db-boyut', 'db-eski', 'db-yeni'].forEach(function (i) { $(i).textContent = '…'; }); dbBilgi(); }
  function dbKapat() { if (!mesgul) $('dbmodal').hidden = true; }
  function butonlar(kilit) { mesgul = kilit; [].forEach.call($('dbmodal').querySelectorAll('button'), function (b) { if (b.id !== 'dbkapat') b.disabled = kilit; }); }

  $('b-db').addEventListener('click', dbAc);
  $('dbkapat').addEventListener('click', dbKapat);
  $('dbmodal').addEventListener('mousedown', function (e) { if (e.target === this) dbKapat(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('dbmodal').hidden) dbKapat(); });

  document.querySelector('.sil-butonlar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-kural]'); if (!b || mesgul) return;
    var kural = b.getAttribute('data-kural');
    dbMesaj(''); butonlar(true);
    dbIstek('/emeklirobot/db.php?islem=onizle&kural=' + kural).then(function (v) {
      if (!v.ok) throw new Error('onizle');
      if (v.adet === 0) { dbMesaj('Bu seçenekle silinecek kayıt yok.'); return; }
      bekleyen = kural;
      $('db-onay-metin').innerHTML = '<strong>' + esc(KURAL_AD[kural]) + '</strong> ' + (kural === 'hepsi' ? 'kayıtlar' : 'kayıtlar') + ' silinecek: <strong>' + v.adet.toLocaleString('tr-TR') + ' kayıt</strong>.<br>Bu işlem <strong>geri alınamaz</strong>. Emin misiniz?';
      $('db-ana').hidden = true; $('db-onay').hidden = false;
    }).catch(function (e) { if (e.message !== 'oturum') dbMesaj('Sayım alınamadı.', 'hata'); })
      .then(function () { butonlar(false); });
  });
  $('db-vazgec').addEventListener('click', function () { if (!mesgul) { dbAna(); dbMesaj('Vazgeçildi.'); } });
  $('db-evet').addEventListener('click', function () {
    if (!bekleyen || mesgul) return;
    var kural = bekleyen; butonlar(true); dbMesaj('Siliniyor…');
    var yenile = false;
    dbIstek('/emeklirobot/db.php', { islem: 'sil', kural: kural }).then(function (v) {
      if (!v.ok) throw new Error('sil');
      dbAna();
      var say = v.silinen.toLocaleString('tr-TR') + ' kayıt silindi.';
      if (!v.bitti) { dbMesaj(say + ' Süre doldu, kalanlar için işlemi tekrarlayın.', 'ok'); dbBilgi(); yukle({ sifirla: true }); return; }
      // Silme tamamlandı: alanı otomatik geri kazan (OPTIMIZE), bitince sayfayı tamamen yenile
      dbMesaj(say + ' Alan geri kazanılıyor (OPTIMIZE)…', 'ok');
      return dbIstek('/emeklirobot/db.php', { islem: 'optimize' }).then(function (o) {
        if (!o.ok) throw new Error('opt');
        yenile = true; dbMesaj(say + ' Alan geri kazanıldı. Sayfa yenileniyor…', 'ok');
        setTimeout(function () { location.reload(); }, 800);
      }).catch(function (e) {
        if (e.message === 'oturum') throw e;
        dbMesaj(say + ' Ancak alan geri kazanılamadı (OPTIMIZE başarısız); elle deneyebilirsiniz.', 'hata'); dbBilgi(); yukle({ sifirla: true });
      });
    }).catch(function (e) { if (e.message !== 'oturum') { dbAna(); dbMesaj('Silme başarısız.', 'hata'); } })
      .then(function () { if (!yenile) butonlar(false); });
  });
  $('db-optimize').addEventListener('click', function (e) {
    e.preventDefault(); if (mesgul) return;
    butonlar(true); dbMesaj('Optimize ediliyor…');
    dbIstek('/emeklirobot/db.php', { islem: 'optimize' }).then(function (v) {
      if (!v.ok) throw new Error('opt'); dbMesaj('Tablo optimize edildi.', 'ok'); dbBilgi();
    }).catch(function (e) { if (e.message !== 'oturum') dbMesaj('Optimize başarısız.', 'hata'); })
      .then(function () { butonlar(false); });
  });


  /* ---------- Bildirim sesi (varsayılan kapalı) ---------- */
  var sesAcik = false, sesCtx = null;
  function sesCal(notalar, sure, zorla) {
    if (!sesAcik && !zorla) return;
    try {
      if (!sesCtx) sesCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (sesCtx.state === 'suspended') sesCtx.resume();
      var t = sesCtx.currentTime;
      notalar.forEach(function (n) {
        var o = sesCtx.createOscillator(), g = sesCtx.createGain(), b = t + n[1];
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, b);
        g.gain.exponentialRampToValueAtTime(0.18, b + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, b + sure);
        o.connect(g); g.connect(sesCtx.destination);
        o.start(b); o.stop(b + sure + 0.05);
      });
    } catch (e) { /* ses desteklenmiyorsa sessizce geç */ }
  }
  function ses() { sesCal([[880, 0], [1318.5, 0.16]], 0.5, false); } // yeni kayıt: kısa iki notalı "ding"
  // Anlık durum cevabı: daha uzun, 4 notalı yükselen melodi; bildirim sesi düğmesinden bağımsız, her zaman çalar
  function anSes() { sesCal([[659.3, 0], [783.99, 0.22], [987.77, 0.44], [1318.5, 0.66]], 0.9, true); }
  $('b-ses').addEventListener('click', function () {
    sesAcik = !sesAcik;
    this.classList.toggle('acik', sesAcik);
    this.setAttribute('aria-pressed', sesAcik ? 'true' : 'false');
    this.title = 'Bildirim sesi: ' + (sesAcik ? 'açık (kapatmak için tıkla)' : 'kapalı (açmak için tıkla)');
    if (sesAcik) ses(); // tıklama kullanıcı etkileşimi olduğu için ses motoru burada açılır; aynı zamanda önizleme
  });

  var oto = null;
  $('f-oto').addEventListener('change', function () {
    clearInterval(oto);
    if (this.checked) oto = setInterval(function () { yukle({ oto: true }); }, 15000);
  });
  if ($('f-oto').checked) oto = setInterval(function () { yukle({ oto: true }); }, 15000); // varsayılan açık


  /* ---------- Bana son durumu göster (anlık durum komutu) ---------- */
  var AN_ARALIK = 3, an = { cihaz: null, komutId: null, tm: null, t0: 0, geri: null };
  var TERMAL = { NORMAL: 'Normal', ISINMIS: 'Isınmış', KRITIK: 'Kritik' };
  function anIstek(url, govde) { return dbIstek(url, govde); }
  function anDur() { if (an.tm) { clearTimeout(an.tm); an.tm = null; } if (an.geri) { clearInterval(an.geri); an.geri = null; } an.komutId = null; $('an-geri').textContent = ''; $('an-not').hidden = true; }
  function saatYaz(ms) { var t = Math.floor(ms / 1000), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(Math.floor(t / 3600)) + ':' + p(Math.floor(t % 3600 / 60)) + ':' + p(t % 60); }
  // Bekleme sayacı: talep anından beri geçen süre (SS:DD:ss), saniyede bir artar
  function anSayac() {
    if (an.geri) clearInterval(an.geri);
    var g = $('an-geri'), yaz = function () { g.textContent = 'Kontrol ediliyor... (' + saatYaz(Date.now() - an.t0) + ')'; };
    yaz(); an.geri = setInterval(yaz, 1000);
  }
  function anBekle() { an.tm = setTimeout(anYokla, AN_ARALIK * 1000); }
  function anMesaj(t, tur) { var m = $('an-mesaj'); m.textContent = t || ''; m.className = 'mesaj' + (tur ? ' ' + tur : ''); }
  var anHarita = null;
  function anHaritaSil() { if (anHarita) { anHarita.remove(); anHarita = null; } }
  function bos(v) { return v === null || v === undefined || v === ''; }
  function sat(e, d) { return '<div class="an-s"><span>' + e + '</span><b>' + d + '</b></div>'; }
  function chip(t, tur) { return '<span class="chip ' + (tur || '') + '">' + t + '</span>'; }
  function anGoster(a, alinma) {
    anHaritaSil();
    var konum = !bos(a.enlem) && !bos(a.boylam);
    var pil = bos(a.pilYuzdesi) ? null : a.pilYuzdesi, pTur = pil === null ? '' : pil <= 15 ? 'kr' : pil <= 35 ? 'uy' : 'ok';
    var h = '<div class="an-kart">';
    h += '<div class="an-baslik"><div><h3>' + esc(an.cihaz) + '</h3><small>Anlık durum · ' + zaman(a.anlikZamani) + '</small></div>';
    h += '<div class="an-chips">' + (bos(a.sarjdaMi) ? '' : chip(a.sarjdaMi ? '⚡ Şarjda' : 'Şarjda değil', a.sarjdaMi ? 'ok' : '')) +
      (bos(a.aracHareketli) ? '' : chip(a.aracHareketli ? 'Araç hareketli' : 'Araç durağan', a.aracHareketli ? 'uy' : '')) +
      (bos(a.termal) ? '' : chip('Isı: ' + (TERMAL[a.termal] || esc(a.termal)), a.termal === 'KRITIK' ? 'kr' : a.termal === 'ISINMIS' ? 'uy' : 'ok')) + '</div></div>';
    if (pil !== null) {
      h += '<div class="an-pil"><div class="an-pil-bar"><i class="' + pTur + '" style="width:' + Math.max(2, Math.min(100, pil)) + '%"></i></div><strong>%' + pil + '</strong>' +
        (bos(a.pilSicakligi) ? '' : '<span>' + a.pilSicakligi + ' °C</span>') + '</div>';
    }
    h += '<div class="an-bolum"><h4>Konum</h4>';
    if (konum) {
      h += '<div id="an-harita"></div>';
      h += sat('Koordinat', a.enlem.toFixed(6) + ', ' + a.boylam.toFixed(6) + ' · <a href="https://www.openstreetmap.org/?mlat=' + a.enlem + '&amp;mlon=' + a.boylam + '#map=17/' + a.enlem + '/' + a.boylam + '" target="_blank" rel="noopener noreferrer">Haritada aç ↗</a>');
    } else { h += sat('Koordinat', 'Konum alınamadı'); }
    h += sat('Doğruluk', bos(a.dogruluk) ? '—' : '±' + (Math.round(a.dogruluk * 10) / 10).toString().replace('.', ',') + ' m');
    h += sat('Konum yaşı', bos(a.konumYasiMs) ? '—' : sureYaz(a.konumYasiMs));
    h += sat('Hız', bos(a.hizKmh) ? '—' : (Math.round(a.hizKmh * 10) / 10).toString().replace('.', ',') + ' km/sa');
    h += sat('Yön', bos(a.yon) ? '—' : '<span class="ok-yon" style="transform:rotate(' + a.yon + 'deg)">↑</span> ' + Math.round(a.yon) + '°');
    h += '</div>';
    h += '<div class="an-bolum"><h4>Uygulama</h4>';
    h += sat('Sürüm', bos(a.surum) ? '—' : esc(a.surum));
    h += sat('GPS modu', bos(a.gpsModu) ? '—' : esc(a.gpsModu));
    h += sat('Bekleyen kayıt', bos(a.bekleyenKayit) ? '—' : a.bekleyenKayit);
    h += sat('Son gönderim', zaman(a.sonGonderimZamani));
    h += sat('Hareket sensörü', bos(a.hareketSensoru) ? '—' : a.hareketSensoru ? 'Evet' : 'Hayır');
    h += sat('Sensör tetiklenme', bos(a.sensorTetiklenme) ? '—' : a.sensorTetiklenme);
    h += sat('Reddedilen konum', bos(a.reddedilenKonum) ? '—' : a.reddedilenKonum);
    h += sat('Son çökme', bos(a.sonCokme) ? '—' : '<span class="cokme">' + esc(a.sonCokme) + '</span>');
    h += '</div>';
    h += '<div class="an-alt">Sunucuya ulaştı: ' + zaman(alinma) + '</div></div>';
    $('an-sonuc').innerHTML = h; $('an-sonuc').hidden = false;
    if (konum) {
      anHarita = L.map('an-harita', { zoomControl: true, attributionControl: false }).setView([a.enlem, a.boylam], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(anHarita);
      if (!bos(a.dogruluk)) L.circle([a.enlem, a.boylam], { radius: a.dogruluk, color: '#2563eb', weight: 1, fillOpacity: .12 }).addTo(anHarita);
      L.marker([a.enlem, a.boylam], { icon: pinIcon }).addTo(anHarita);
      setTimeout(function () { if (anHarita) anHarita.invalidateSize(); }, 50);
    }
  }
  function anYokla() {
    if (!an.komutId) return;
    var id = an.komutId, cihaz = an.cihaz;
    anIstek('/emeklirobot/anlik.php?islem=sorgu&komutId=' + id + '&cihazAdi=' + encodeURIComponent(cihaz)).then(function (v) {
      if (an.komutId !== id) return;
      if (!v.ok) throw new Error('sorgu');
      if (v.durum === 'TAMAM' && v.anlik) { anDur(); anMesaj(''); anGoster(v.anlik, v.alinma); anSes(); return; }
      if (v.durum === 'ZAMAN_ASIMI') { anDur(); anMesaj('İstek 30 dk içinde cevaplanmadığı için zaman aşımına uğradı. Yeniden deneyin.', 'hata'); return; }
      if (v.durum === 'TAMAM') { anDur(); anMesaj('Cevap alındı ancak veri okunamadı.', 'hata'); return; }
      anBekle();
    }).catch(function (e) {
      if (e.message === 'oturum' || an.komutId !== id) return;
      anBekle();
    });
  }
  function dkYaz(sn) { return sn < 90 ? sn + ' sn' : sn < 5400 ? Math.round(sn / 60) + ' dk' : (sn / 3600).toFixed(1).replace('.', ',') + ' sa'; }
  function saatIst(ms) { return new Date(ms + 3 * 3600e3).toISOString().slice(11, 19); } // Türkiye UTC+3
  function anNot(t) {
    var n = $('an-not');
    if (!t) { n.hidden = true; return; }
    var s = 'Not: Telefon genelde ' + dkYaz(t.aralikSn) + ' arayla sunucuya bağlanıyor, çoğu zaman en geç ' + dkYaz(t.p80Sn) + ' içinde. ';
    s += t.p80Sn <= 180 ? 'Cevap birkaç dakikada gelir.' : 'Cevap biraz gecikebilir; sayfayı açık bırak, gelince ses çalar.';
    n.textContent = s; n.hidden = false;
  }
  function anSec(cihaz) {
    anDur(); anHaritaSil(); an.cihaz = cihaz; an.t0 = Date.now();
    try { if (!sesCtx) sesCtx = new (window.AudioContext || window.webkitAudioContext)(); if (sesCtx.state === 'suspended') sesCtx.resume(); } catch (e) { /* ses yok */ } $('an-sonuc').hidden = true;
    [].forEach.call($('an-liste').querySelectorAll('button'), function (b) { b.classList.toggle('sec', b.getAttribute('data-cihaz') === cihaz); });
    anMesaj('İstek gönderiliyor…');
    anIstek('/emeklirobot/anlik.php', { islem: 'ac', cihazAdi: cihaz }).then(function (v) {
      if (!v.ok) throw new Error('ac');
      an.komutId = v.komutId; anNot(v.tahmin); anMesaj('Anlık durum talebi ' + saatIst(an.t0) + ' da alındı.'); anSayac(); anYokla();
    }).catch(function (e) { if (e.message !== 'oturum') anMesaj('İstek açılamadı.', 'hata'); });
  }
  function anAc() {
    $('anmodal').hidden = false; anMesaj('Cihazlar yükleniyor…'); $('an-sonuc').hidden = true; $('an-liste').innerHTML = '';
    anIstek('/emeklirobot/anlik.php?islem=cihazlar').then(function (v) {
      if (!v.ok) throw new Error('liste');
      if (!v.cihazlar.length) { anMesaj('Henüz kayıtlı cihaz yok.'); return; }
      anMesaj('Bir cihaz seçin.');
      v.cihazlar.sort(function (x, y) { return x.cihazAdi.localeCompare(y.cihazAdi, 'tr', { sensitivity: 'base' }); });
      $('an-liste').innerHTML = v.cihazlar.map(function (c) {
        return '<button type="button" data-cihaz="' + esc(c.cihazAdi) + '" data-son="' + esc(c.sonGorulme || '') + '"><span>' + esc(c.cihazAdi) + '</span><small>Son görülme: ' + zaman(c.sonGorulme) + '</small></button>';
      }).join('');
    }).catch(function (e) { if (e.message !== 'oturum') anMesaj('Cihaz listesi alınamadı.', 'hata'); });
  }
  function anKapat() { anDur(); anHaritaSil(); $('anmodal').hidden = true; }
  $('b-anlik').addEventListener('click', anAc);
  $('ankapat').addEventListener('click', anKapat);
  $('anmodal').addEventListener('mousedown', function (e) { if (e.target === this) anKapat(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('anmodal').hidden) anKapat(); });
  $('an-liste').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cihaz]'); if (!b) return;
    anSec(b.getAttribute('data-cihaz'));
  });

  cipler('f-tipler', durum.tipler, TIP);
  $('f-bas').value = istYerel(Date.now()).slice(0, 10) + 'T00:00'; // varsayılan: bugün 00:00 (Türkiye saati)
  yukle({ ilk: true, sifirla: true });
})();
