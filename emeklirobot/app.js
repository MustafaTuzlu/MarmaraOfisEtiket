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
      return '<label class="cihaz-satir"><button type="button" class="cihaz-nokta" data-nokta="' + esc(ad) + '" style="background:' + renkler[ad] + '" title="Rengi değiştir"></button><span class="cihaz-ad">' + esc(ad) +
        '</span><input type="checkbox" class="anahtar" data-cihaz="' + esc(ad) + '"' + (gorunur[ad] ? ' checked' : '') + '><i></i></label>' + palet;
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
    anim.pos += (t - anim.son) / 1000 * Number($('a-hiz').value); anim.son = t;
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

  var istek = 0;
  function yukle(opts) {
    opts = opts || {};
    var no = ++istek;
    $('durum').textContent = 'Yükleniyor…';
    fetch('/emeklirobot/api.php?' + sorgu(!durum.secenekGeldi), { credentials: 'same-origin', cache: 'no-store' })
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
      .catch(function (e) { if (e && e.message !== 'oturum') $('durum').textContent = 'Veri alınamadı.'; });
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
    var b = e.target.closest('button[data-saat]'); if (!b) return;
    var s = b.getAttribute('data-saat'), simdi = Date.now();
    if (s === 'bugun') $('f-bas').value = istYerel(simdi).slice(0, 10) + 'T00:00';
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
    dbIstek('/emeklirobot/db.php', { islem: 'sil', kural: kural }).then(function (v) {
      if (!v.ok) throw new Error('sil');
      dbAna();
      dbMesaj(v.silinen.toLocaleString('tr-TR') + ' kayıt silindi.' + (v.bitti ? '' : ' Süre doldu, kalanlar için işlemi tekrarlayın.'), 'ok');
      dbBilgi(); yukle({ sifirla: true });
    }).catch(function (e) { if (e.message !== 'oturum') { dbAna(); dbMesaj('Silme başarısız.', 'hata'); } })
      .then(function () { butonlar(false); });
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
  function ses() {
    if (!sesAcik) return;
    try {
      if (!sesCtx) sesCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (sesCtx.state === 'suspended') sesCtx.resume();
      var t = sesCtx.currentTime;
      [[880, 0], [1318.5, 0.16]].forEach(function (n) { // yumuşak iki notalı "ding"
        var o = sesCtx.createOscillator(), g = sesCtx.createGain(), b = t + n[1];
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, b);
        g.gain.exponentialRampToValueAtTime(0.18, b + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, b + 0.5);
        o.connect(g); g.connect(sesCtx.destination);
        o.start(b); o.stop(b + 0.55);
      });
    } catch (e) { /* ses desteklenmiyorsa sessizce geç */ }
  }
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

  cipler('f-tipler', durum.tipler, TIP);
  yukle({ ilk: true, sifirla: true });
})();
