(function () {
  'use strict';

  var TIP = {
    SARJ_BASLADI: 'Şarj başladı (kontak açıldı)', SARJ_KESILDI: 'Şarj kesildi (kontak kapandı)',
    ARAC_HAREKET: 'Araç harekete geçti', ARAC_DURUYOR: 'Araç durdu', KONUM: 'Konum (hareketli)',
    DURUM: 'Durum (durağan)', KONUM_ALINAMADI: 'Konum alınamadı', CIHAZ_ISINDI: 'Cihaz ısındı (≥45°C)',
    CIHAZ_KRITIK_ISINDI: 'Cihaz kritik ısındı (≥48°C)', CIHAZ_SOGUDU: 'Cihaz soğudu'
  };
  var $ = function (id) { return document.getElementById(id); };
  var durum = { kayitlar: [], sonKonum: null, secili: null, elle: false, secenekGeldi: false, tipler: Object.keys(TIP), cihazlar: [] };

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
      ['Konum yaşı', k.konumYasiMs === null ? '—' : (k.konumYasiMs / 1000).toFixed(1) + ' sn'],
      ['Zaman kaynağı', esc(k.zamanKaynagi) + ' <small>(ELAPSED: sunucuya göre düzeltildi, CIHAZ: yedek, YOK: düzeltme yok)</small>'],
      ['Sunucuya ulaştı', zaman(k.alinmaZamani)],
      ['elapsedRealtime', k.elapsedRealtime + ' ms'],
      ['Kayıt UUID', '<small>' + esc(k.kayit) + '</small>'],
      ['Sıra no', k.id]
    ];
    $('detay').innerHTML = '<h3>Log detayı</h3><dl>' + satirlar.map(function (s) { return '<dt>' + s[0] + '</dt><dd>' + s[1] + '</dd>'; }).join('') + '</dl>';
  }

  /* ---------- Liste ---------- */
  function listeYaz() {
    var tb = document.querySelector('#liste tbody');
    if (!durum.kayitlar.length) { tb.innerHTML = '<tr><td colspan="8" class="bos">Kayıt bulunamadı.</td></tr>'; return; }
    tb.innerHTML = durum.kayitlar.map(function (k) {
      var sicakRozet = k.pilSicakligi === null ? '—' : '<span class="rozet' + (k.pilSicakligi >= 48 ? ' kritik' : k.pilSicakligi >= 45 ? ' sicak' : '') + '">' + k.pilSicakligi + '°C</span>';
      return '<tr data-id="' + k.id + '"' + (k.id === durum.secili ? ' class="secili"' : '') + '><td>' + zaman(k.zaman) + '</td><td>' + esc(k.logTipi) + '</td><td>' + esc(k.cihazAdi) +
        '</td><td>' + (konumlu(k) ? '<span class="rozet konum">var</span>' : '<span class="rozet yok">yok</span>') + '</td><td>' + (k.pilYuzdesi === null ? '—' : k.pilYuzdesi) +
        '</td><td>' + sicakRozet + '</td><td>' + evetHayir(k.aracHareketli, 'Hareketli', 'Durağan') + '</td><td>' + evetHayir(k.sarjdaMi, 'Evet', 'Hayır') + '</td></tr>';
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
  function okIcon(deg) {
    return L.divIcon({
      className: 'ok', iconSize: [16, 16], iconAnchor: [8, 8],
      html: '<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(' + deg.toFixed(1) + 'deg)"><path d="M8 1l5.5 13L8 11l-5.5 3z" fill="#1d4ed8" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>'
    });
  }
  function oklariGuncelle() { // iki nokta ekranda birbirine çok yakınsa oku gizle (karmaşayı önler)
    oklar.forEach(function (o) {
      var el = o.m.getElement(); if (!el) return;
      el.style.display = harita.latLngToContainerPoint(o.a).distanceTo(harita.latLngToContainerPoint(o.b)) < 22 ? 'none' : '';
    });
  }
  harita.on('zoomend', oklariGuncelle);

  /* ---------- Harita noktaları ---------- */
  function noktalariCiz(sigdir) {
    katman.clearLayers();
    var pts = [];
    durum.kayitlar.slice().reverse().forEach(function (k) {
      if (!konumlu(k)) return;
      pts.push([k.enlem, k.boylam]);
      L.circleMarker([k.enlem, k.boylam], { radius: 5, weight: 1, color: '#fff', fillColor: '#2563eb', fillOpacity: .85 })
        .addTo(katman).on('click', function () { durum.elle = true; sec(k.id, false); });
    });
    if (pts.length > 1) L.polyline(pts, { color: '#2563eb', weight: 2, opacity: .35 }).addTo(katman);
    oklar = [];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      var m = L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: okIcon(yon(a, b)), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(katman);
      oklar.push({ m: m, a: a, b: b });
    }
    oklariGuncelle();
    if (sigdir && pts.length > 1) harita.fitBounds(pts, { maxZoom: 16, padding: [30, 30] });
  }

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
        durum.kayitlar = v.kayitlar; durum.sonKonum = v.sonKonum;
        $('sayac').textContent = v.toplam + ' kayıt eşleşti, ilk ' + v.kayitlar.length + ' tanesi listeleniyor';
        $('durum').textContent = 'Güncellendi: ' + zaman(v.sunucuZamani);
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

  var oto = null;
  $('f-oto').addEventListener('change', function () {
    clearInterval(oto);
    if (this.checked) oto = setInterval(function () { yukle({}); }, 15000);
  });

  cipler('f-tipler', durum.tipler, TIP);
  yukle({ ilk: true, sifirla: true });
})();
