/* Panel pencerelerinin ortak yardımcıları: biçimlendirme, sunucu istekleri, haritada gösterme ve yolculuk oynatma. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sayi(n, k) { return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: k || 0, maximumFractionDigits: k || 0 }); }
  function bicim(ayar) { ayar.timeZone = 'Europe/Istanbul'; var f = new Intl.DateTimeFormat('tr-TR', ayar); return function (t) { return f.format(new Date(t)); }; }
  var saat = bicim({ hour: '2-digit', minute: '2-digit', hour12: false });
  var gunAd = bicim({ day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
  var gunKisa = bicim({ day: '2-digit', month: 'short', weekday: 'short' });
  var kisaTarih = bicim({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  function sure(ms) {
    if (ms < 60e3) return Math.round(ms / 1000) + ' sn';
    var dk = Math.round(ms / 60e3);
    if (dk < 60) return dk + ' dk';
    var sa = Math.floor(dk / 60);
    if (sa >= 48) return Math.floor(sa / 24) + ' gün' + (sa % 24 ? ' ' + (sa % 24) + ' sa' : '');
    return sa + ' sa' + (dk % 60 ? ' ' + (dk % 60) + ' dk' : '');
  }
  function km(m) { return sayi(m / 1000, 1) + ' km'; }
  function metre(m) { return m >= 1000 ? km(m) : Math.round(m) + ' m'; }
  // İstanbul (UTC+3 sabit) günü: 'YYYY-AA-GG' ve o günün başlangıcı
  function istGun(t) { return new Date(t + 3 * 3600e3).toISOString().slice(0, 10); }
  function gunBasi(gun) { return Date.parse(gun + 'T00:00:00+03:00'); }
  function gunEkle(gun, n) { return istGun(gunBasi(gun) + n * 864e5 + 12 * 3600e3); }

  // govde verilirse POST (CSRF ile). Başarısız yanıtta kod alanlı hata fırlatır.
  function istek(url, govde, sinyal) {
    var o = { credentials: 'same-origin', cache: 'no-store', signal: sinyal };
    if (govde) { o.method = 'POST'; o.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': document.body.getAttribute('data-csrf') }; o.body = JSON.stringify(govde); }
    return fetch(url, o).then(function (r) {
      if (r.status === 401) { location.reload(); throw hata('oturum'); }
      return r.json().catch(function () { throw hata('sunucu'); });
    }).then(function (v) { if (!v || !v.ok) throw hata((v && v.hata) || 'sunucu'); return v; });
  }
  function hata(kod) { var e = new Error(kod); e.kod = kod; return e; }
  function ozellik(islem, govde) {
    if (govde) { govde.islem = islem; return istek('/emeklirobot/ozellik.php', govde); }
    return istek('/emeklirobot/ozellik.php?islem=' + islem);
  }
  function hataMetni(e) {
    if (e && e.kod === 'tablo_yok') return 'Veritabanı tabloları henüz oluşturulmamış. phpMyAdmin’de db/2026-11-27-yerler.sql dosyasını bir kez çalıştırın.';
    return 'Sunucudan veri alınamadı ya da kaydedilemedi. Tekrar deneyin.';
  }

  // api.php analiz=veri satırı -> analiz motorunun kayıt biçimi (sıra api.php ile aynı olmalı)
  function kayitCevir(r) {
    return { cihaz: r[0], tip: r[1], t: r[2] * 1000, lat: r[3], lon: r[4], acc: r[5], hiz: r[6], pil: r[7], sarj: r[8] === null ? null : r[8] === 1, sic: r[9], har: r[10] === null ? null : r[10] === 1, alinma: r[11] * 1000 };
  }
  // q: URLSearchParams (api.php filtreleri). Sonuç: {toplam, sinir, kayitlar|null}
  function veriGetir(q, sinyal) {
    q.set('analiz', 'veri');
    return istek('/emeklirobot/api.php?' + q.toString(), null, sinyal).then(function (v) {
      return { toplam: v.toplam, sinir: v.sinir, kayitlar: v.satirlar ? v.satirlar.map(kayitCevir) : null };
    });
  }
  function aralikSorgu(basMs, bitMs, cihaz) {
    var q = new URLSearchParams();
    q.set('bas', new Date(basMs).toISOString()); q.set('bit', new Date(bitMs).toISOString());
    if (cihaz) q.set('cihaz', cihaz);
    return q;
  }

  /* ---------- Pencereler ---------- */
  var pencereler = [];
  // × düğmesi, arka plana tıklama ve Esc ile kapanan pencere
  function pencere(id, kapatId, kapatinca) {
    function kapat() { $(id).hidden = true; if (kapatinca) kapatinca(); }
    $(kapatId).addEventListener('click', kapat);
    $(id).addEventListener('mousedown', function (e) { if (e.target === this) kapat(); });
    pencereler.push({ id: id, kapat: kapat });
    return kapat;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    pencereler.forEach(function (p) { if (!$(p.id).hidden) p.kapat(); });
  });
  // Haritayla çalışmak için açık pencereleri gizler; dönen işlev aynı yerden geri açar
  function pencereleriGizle() {
    var acik = [].filter.call(document.querySelectorAll('.modal'), function (m) { return !m.hidden; }).map(function (m) {
      var kutu = m.querySelector('.modal-kutu'), y = kutu.scrollTop;
      m.hidden = true;
      return function () { m.hidden = false; kutu.scrollTop = y; };
    });
    return function () { acik.forEach(function (f) { f(); }); };
  }

  /* ---------- Haritada gösterme + yolculuk oynatma ---------- */
  var harita = null, katman = null, kontrol = null, oynatici = null;

  function temizle() {
    if (oynatici) { cancelAnimationFrame(oynatici.kare); oynatici = null; }
    if (katman) { harita.removeLayer(katman); katman = null; }
    if (kontrol) { harita.removeControl(kontrol); kontrol = null; }
  }

  /* h: {etiket, nokta:[[lat,lon]…]} ya da {etiket, konum:[lat,lon]}; iz:[{t,lat,lon,hiz}] verilirse oynatma düğmeleri çıkar.
     don: "Geri dön"e basılınca çağrılır (verilmezse açık pencereler gizlenip aynı yerden geri açılır). */
  function haritadaGoster(h) {
    temizle();
    var geri = pencereleriGizle();
    katman = L.layerGroup().addTo(harita);
    var iz = h.iz && h.iz.length > 1 ? h.iz : null;
    var cizgi = iz ? iz.map(function (p) { return [p.lat, p.lon]; }) : h.nokta;
    var Kutu = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'az-don');
        if (h.liste) d.classList.add('az-don-hikaye');
        d.innerHTML = (h.liste ? '<ol class="az-hik">' + h.liste.map(function (x, i) { return '<li><button type="button" data-is="olay" data-i="' + i + '"><b>' + (x.no || '▸') + '</b> ' + esc(x.yazi) + '</button></li>'; }).join('') + '</ol>' : '') +
          '<span>' + esc(h.etiket) + '</span>' +
          (iz ? '<button type="button" data-is="oynat">❚❚</button><select data-is="hiz" aria-label="Oynatma hızı"><option value="2">1×</option><option value="4" selected>2×</option><option value="8">4×</option><option value="16">8×</option><option value="32">16×</option></select><em class="az-an"></em>' : '') +
          '<button type="button" data-is="don">← Geri dön</button><button type="button" data-is="sil" aria-label="İşareti kaldır" title="İşareti kaldır">×</button>';
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.disableScrollPropagation(d);
        L.DomEvent.on(d, 'click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          var is = b.getAttribute('data-is');
          if (is === 'oynat') { oynatDegistir(); return; }
          if (is === 'olay') { olayaGit(h.liste[Number(b.getAttribute('data-i'))]); return; }
          temizle();
          if (is === 'don') geri();
        });
        return d;
      }
    });
    kontrol = new Kutu().addTo(harita);
    $('harita').scrollIntoView({ block: 'center' });
    harita.invalidateSize();
    if (cizgi && cizgi.length > 1) {
      L.polyline(cizgi, { color: '#0f172a', weight: 9, opacity: .55, interactive: false }).addTo(katman);
      L.polyline(cizgi, { color: '#f59e0b', weight: 5, opacity: 1, interactive: false }).addTo(katman);
      L.circleMarker(cizgi[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).bindTooltip('Başlangıç').addTo(katman);
      L.circleMarker(cizgi[cizgi.length - 1], { radius: 7, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }).bindTooltip('Bitiş').addTo(katman);
      var kutuYuk = kontrol.getContainer().offsetHeight;
      harita.fitBounds(cizgi, { maxZoom: 17, paddingTopLeft: [30, 30], paddingBottomRight: [30, Math.min(kutuYuk + 20, harita.getSize().y * .6)] });
    } else {
      var k = h.konum || cizgi[0];
      L.circle(k, { radius: 40, color: '#f59e0b', weight: 2, fillOpacity: .2, interactive: false }).addTo(katman);
      L.circleMarker(k, { radius: 9, color: '#0f172a', weight: 3, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(katman);
      harita.setView(k, 17);
    }
    (h.duraklar || []).forEach(function (p) {
      L.marker(p.konum, { zIndexOffset: 1500, icon: L.divIcon({ className: 'az-durak', html: '<span>' + p.no + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip(esc(p.etiket)).addTo(katman);
    });
    if (iz) {
      var arac = L.circleMarker([iz[0].lat, iz[0].lon], { radius: 10, color: '#fff', weight: 4, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(katman);
      oynatici = { iz: iz, arac: arac, konum: 0, oynuyor: true, son: null, kare: 0 };
      anCiz();
      oynatici.kare = requestAnimationFrame(adim);
    }
  }
  // Listeden bir olaya tıklayınca oynatma o ana atlar ve duraklar
  function olayaGit(x) {
    if (x.konum) harita.setView(x.konum, Math.max(harita.getZoom(), 16));
    var o = oynatici; if (!o) return;
    if (o.oynuyor) oynatDegistir();
    var i = 0; while (i < o.iz.length - 1 && o.iz[i].t < x.t) i++;
    o.konum = i; anCiz();
    if (x.konum) harita.setView(x.konum, harita.getZoom());
  }
  function kutuEl(secici) { return kontrol && kontrol.getContainer().querySelector(secici); }
  function anCiz() {
    var o = oynatici, i = Math.min(o.iz.length - 1, Math.floor(o.konum)), a = o.iz[i], b = o.iz[Math.min(o.iz.length - 1, i + 1)], k = o.konum - i;
    var p = [a.lat + (b.lat - a.lat) * k, a.lon + (b.lon - a.lon) * k];
    o.arac.setLatLng(p);
    if (!harita.getBounds().pad(-.15).contains(p)) harita.panTo(p, { animate: false });
    var y = kutuEl('.az-an'); if (y) y.textContent = saat(a.t) + (a.hiz === null || a.hiz === undefined ? '' : ' · ' + sayi(a.hiz) + ' km/sa');
  }
  function adim(z) {
    var o = oynatici; if (!o || !o.oynuyor) return;
    var hizKutu = kutuEl('[data-is="hiz"]'), hiz = hizKutu ? Number(hizKutu.value) : 4; // saniyede kaç nokta
    if (o.son !== null) o.konum = Math.min(o.iz.length - 1, o.konum + Math.max(0, z - o.son) / 1000 * hiz);
    o.son = z;
    anCiz();
    if (o.konum >= o.iz.length - 1) { o.oynuyor = false; var d = kutuEl('[data-is="oynat"]'); if (d) d.textContent = '▶'; return; }
    o.kare = requestAnimationFrame(adim);
  }
  function oynatDegistir() {
    var o = oynatici, d = kutuEl('[data-is="oynat"]'); if (!o) return;
    o.oynuyor = !o.oynuyor;
    if (o.oynuyor) { if (o.konum >= o.iz.length - 1) o.konum = 0; o.son = null; o.kare = requestAnimationFrame(adim); }
    else cancelAnimationFrame(o.kare);
    d.textContent = o.oynuyor ? '❚❚' : '▶';
  }

  window.Ortak = {
    esc: esc, sayi: sayi, saat: saat, gunAd: gunAd, gunKisa: gunKisa, kisaTarih: kisaTarih, sure: sure, km: km, metre: metre,
    istGun: istGun, gunBasi: gunBasi, gunEkle: gunEkle, istek: istek, ozellik: ozellik, hataMetni: hataMetni,
    kayitCevir: kayitCevir, veriGetir: veriGetir, aralikSorgu: aralikSorgu, pencere: pencere, pencereleriGizle: pencereleriGizle,
    haritaKur: function (h) { harita = h; }, haritadaGoster: haritadaGoster, haritaTemizle: temizle
  };
})();
