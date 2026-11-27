/* Kayıtlı yerler: bir yerin birden fazla konumu olabilir (bina, otopark…). Sunucuda saklanır.
   Eşleştirme görüntüleme anında yapılır; yeni eklenen yer geçmiş kayıtlarda da görünür. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak;
  var TUR = { ev: 'Ev', is: 'İş yeri', diger: 'Diğer' }, IKON = { ev: '🏠', is: '🏢', diger: '📍' };
  var VARSAYILAN_YARICAP = 150, YAKIN = 800;
  var harita = null, liste = [], hataDurumu = null, dinleyenler = [], yukleme = null;
  var duzen = null; // açık yer düzenleyici
  var uygulananKoord = ''; // koordinat kutusunda haritaya son uygulanan metin

  function degisti() { dinleyenler.forEach(function (f) { f(); }); }
  function yukle() {
    yukleme = O.ozellik('yerler').then(function (v) { liste = v.yerler; hataDurumu = null; degisti(); }, function (e) { hataDurumu = e; });
    return yukleme;
  }
  function yerKimlik(id) { for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i]; return null; }
  function tamAd(yer, nokta) { return yer.ad + (yer.noktalar.length > 1 && nokta.etiket ? ' (' + nokta.etiket + ')' : ''); }
  function uzaklik(n, lat, lon) { return Analiz.mesafe({ lat: n.lat, lon: n.lon }, { lat: lat, lon: lon }); }

  // Noktayı içine alan kayıtlı konumlardan en yakını
  function bul(lat, lon) {
    var en = null;
    liste.forEach(function (y) {
      y.noktalar.forEach(function (n) {
        var d = uzaklik(n, lat, lon);
        if (d <= n.yaricap && (!en || d < en.d)) en = { d: d, yer: y, nokta: n };
      });
    });
    return en ? { anahtar: en.yer.id + ':' + en.nokta.id, ad: tamAd(en.yer, en.nokta), yer: en.yer, nokta: en.nokta, tur: en.yer.tur } : null;
  }
  // Hiçbir daireye girmeyen konum için yakındaki kayıtlı yer ipucu (otopark gibi)
  function yakin(lat, lon) {
    var en = null;
    liste.forEach(function (y) {
      y.noktalar.forEach(function (n) { var d = uzaklik(n, lat, lon); if (d <= YAKIN && (!en || d < en.mesafe)) en = { yerId: y.id, ad: y.ad, mesafe: d }; });
    });
    return en;
  }

  /* ---------- Haritada konum düzenleyici ---------- */
  function secenekler(secili) {
    return '<option value="">➕ Yeni yer</option>' + liste.map(function (y) {
      return '<option value="' + y.id + '"' + (y.id === secili ? ' selected' : '') + '>' + O.esc(IKON[y.tur] + ' ' + y.ad) + '</option>';
    }).join('');
  }

  /* ayar: {lat, lon, yerId, noktaId}. lat verilmezse harita ortasından başlar. Kapanınca gizlenen pencereler geri açılır. */
  function duzenle(ayar) {
    ayar = ayar || {};
    if (hataDurumu) { alert(O.hataMetni(hataDurumu)); return; }
    duzenKapat(false);
    O.haritaTemizle();
    var geri = O.pencereleriGizle();
    var yer = ayar.yerId ? yerKimlik(ayar.yerId) : null, nokta = null;
    if (yer && ayar.noktaId) yer.noktalar.forEach(function (n) { if (n.id === ayar.noktaId) nokta = n; });
    var bas = nokta ? [nokta.lat, nokta.lon] : (ayar.lat !== undefined ? [ayar.lat, ayar.lon] : [harita.getCenter().lat, harita.getCenter().lng]);
    var yaricap = nokta ? nokta.yaricap : VARSAYILAN_YARICAP;
    var katman = L.layerGroup().addTo(harita);
    liste.forEach(function (y) { // diğer kayıtlı konumlar soluk daireler olarak görünür
      y.noktalar.forEach(function (n) {
        if (nokta && n.id === nokta.id) return;
        L.circle([n.lat, n.lon], { radius: n.yaricap, color: '#64748b', weight: 1, fillOpacity: .12, interactive: false }).addTo(katman);
        L.circleMarker([n.lat, n.lon], { radius: 4, color: '#475569', weight: 1, fillOpacity: 1 }).bindTooltip(O.esc(tamAd(y, n))).addTo(katman);
      });
    });
    var daire = L.circle(bas, { radius: yaricap, color: '#2563eb', weight: 2, fillOpacity: .15, interactive: false }).addTo(katman);
    var isaret = L.marker(bas, { draggable: true, zIndexOffset: 2000, icon: L.divIcon({ className: 'yer-isaret', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(katman);
    duzen = { katman: katman, daire: daire, isaret: isaret, nokta: nokta, geri: geri };

    $('yp-baslik').textContent = nokta ? 'Konumu düzenle' : 'Konum kaydet';
    $('yp-yer').innerHTML = secenekler(yer ? yer.id : null);
    $('yp-ad').value = ''; $('yp-tur').value = 'is';
    $('yp-etiket').value = nokta ? nokta.etiket : '';
    $('yp-yaricap').value = yaricap; $('yp-yaricap-yaz').textContent = yaricap + ' m';
    $('yp-mesaj').textContent = ''; $('yp-kaydet').disabled = false;
    $('yp-koord').value = ''; uygulananKoord = '';
    yeniAlanlar(); cakisma();
    $('yerpanel').hidden = false;
    $('harita').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -70);
    harita.invalidateSize();
    harita.setView(bas, Math.max(harita.getZoom(), 16));
    harita.on('click', haritaTik);
    isaret.on('drag', function () { daire.setLatLng(isaret.getLatLng()); cakisma(); });
  }
  function haritaTik(e) { duzen.isaret.setLatLng(e.latlng); duzen.daire.setLatLng(e.latlng); cakisma(); }
  // "41.1144876,28.5647841" biçimi; virgülün önünde/arkasında ve uçlarda boşluk olabilir
  function koordAyir(metin) {
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(metin);
    if (!m) return null;
    var lat = Number(m[1]), lon = Number(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
  }
  function koordGit() {
    var p = koordAyir($('yp-koord').value);
    if (!p) { $('yp-mesaj').textContent = 'Koordinat okunamadı. Örnek: 41.1144876, 28.5647841'; $('yp-koord').focus(); return false; }
    $('yp-mesaj').textContent = '';
    uygulananKoord = $('yp-koord').value;
    duzen.isaret.setLatLng(p); duzen.daire.setLatLng(p);
    $('harita').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -70);
    harita.setView(p, Math.max(harita.getZoom(), 16));
    cakisma();
    return true;
  }
  function yeniAlanlar() {
    var yeni = $('yp-yer').value === '';
    $('yp-yeni').hidden = !yeni;
  }
  function cakisma() {
    var p = duzen.isaret.getLatLng(), r = Number($('yp-yaricap').value), secili = Number($('yp-yer').value) || null, ad = [];
    liste.forEach(function (y) {
      if (y.id === secili) return;
      y.noktalar.forEach(function (n) {
        if ((!duzen.nokta || n.id !== duzen.nokta.id) && uzaklik(n, p.lat, p.lng) < r + n.yaricap && ad.indexOf(y.ad) < 0) ad.push(y.ad);
      });
    });
    $('yp-uyari').textContent = ad.length ? 'Daire şu yerlerle kesişiyor: ' + ad.join(', ') + '. Ortak alanda en yakın konum seçilir.' : '';
  }
  function duzenKapat(geriDon) {
    if (!duzen) return;
    harita.off('click', haritaTik);
    harita.removeLayer(duzen.katman);
    var geri = duzen.geri; duzen = null;
    $('yerpanel').hidden = true;
    if (geriDon) geri();
  }
  function kaydet() {
    // Koordinat yazılıp "Konuma git"e basılmadıysa eski nokta kaydedilmesin: önce haritada gösterilir
    var yazilan = $('yp-koord').value;
    if (yazilan.trim() && yazilan !== uygulananKoord) {
      if (koordGit()) $('yp-mesaj').textContent = 'Harita girilen konuma gitti. Kontrol edip tekrar Kaydet’e basın.';
      return;
    }
    var p = duzen.isaret.getLatLng(), secili = Number($('yp-yer').value) || null;
    var nokta = { etiket: $('yp-etiket').value.trim(), lat: p.lat, lon: ((p.lng + 540) % 360) - 180, yaricap: Number($('yp-yaricap').value) };
    var govde, islem;
    if (!secili) {
      var ad = $('yp-ad').value.trim();
      if (!ad) { $('yp-mesaj').textContent = 'Yer adı yazın.'; $('yp-ad').focus(); return; }
      islem = 'yer_kaydet'; govde = { ad: ad, tur: $('yp-tur').value, nokta: nokta };
    } else { islem = 'nokta_kaydet'; govde = { yerId: secili, nokta: nokta, id: duzen.nokta ? duzen.nokta.id : 0 }; }
    var tasinan = !secili && duzen.nokta ? duzen.nokta.id : 0; // var olan konum yeni bir yere taşındıysa eskisi silinir
    $('yp-kaydet').disabled = true; $('yp-mesaj').textContent = 'Kaydediliyor…';
    O.ozellik(islem, govde).then(function () { return tasinan ? O.ozellik('nokta_sil', { id: tasinan }) : null; })
      .then(yukle).then(function () { duzenKapat(true); yonetCiz(); })
      .catch(function (e) { $('yp-mesaj').textContent = O.hataMetni(e); $('yp-kaydet').disabled = false; });
  }

  /* ---------- "Yerlerim" penceresi ---------- */
  function yonetCiz() {
    var k = $('yr-liste'); if (!k) return;
    if (hataDurumu) { k.innerHTML = '<p class="az-uyari">' + O.esc(O.hataMetni(hataDurumu)) + '</p>'; return; }
    if (!liste.length) { k.innerHTML = '<p class="not">Henüz kayıtlı yer yok. “Haritadan yer ekle” ile ya da analizdeki “Durulan yerler” listesinden ekleyebilirsiniz.</p>'; return; }
    k.innerHTML = ['ev', 'is', 'diger'].map(function (t) {
      var Y = liste.filter(function (y) { return y.tur === t; });
      if (!Y.length) return '';
      return '<h3 class="yr-tur">' + IKON[t] + ' ' + TUR[t] + '</h3>' + Y.map(function (y) {
        return '<div class="yr-yer" data-yer="' + y.id + '"><div class="yr-ust"><input class="yr-ad" value="' + O.esc(y.ad) + '" maxlength="60" aria-label="Yer adı">' +
          '<select class="yr-tursec" aria-label="Yer türü">' + Object.keys(TUR).map(function (x) { return '<option value="' + x + '"' + (x === y.tur ? ' selected' : '') + '>' + TUR[x] + '</option>'; }).join('') + '</select>' +
          '<button type="button" data-is="yer-sil" class="yr-sil">Yeri sil</button></div><ul>' +
          y.noktalar.map(function (n) {
            return '<li data-nokta="' + n.id + '"><span>' + O.esc(n.etiket || 'Konum') + ' · ' + n.yaricap + ' m</span><button type="button" data-is="nokta-duzenle" class="az-git">Haritada düzenle</button><button type="button" data-is="nokta-sil" class="az-git yr-kirmizi">Sil</button></li>';
          }).join('') + (y.noktalar.length ? '' : '<li><span>Konumu yok; analizde eşleşmez.</span></li>') +
          '</ul><button type="button" data-is="nokta-ekle" class="az-git">+ Konum ekle (otopark vb.)</button></div>';
      }).join('');
    }).join('');
  }
  function yonetMesaj(t) { $('yr-mesaj').textContent = t || ''; }
  function islemYap(islem, govde) {
    yonetMesaj('Kaydediliyor…');
    return O.ozellik(islem, govde).then(yukle).then(function () { yonetMesaj(''); yonetCiz(); })
      .catch(function (e) { yonetMesaj(O.hataMetni(e)); });
  }
  function yonetAc() { yonetMesaj(''); $('yrmodal').hidden = false; yonetCiz(); yukle().then(yonetCiz); }

  function baslat(h) {
    harita = h;
    O.pencere('yrmodal', 'yrkapat');
    $('yr-ekle').addEventListener('click', function () { duzenle({}); });
    $('yr-liste').addEventListener('change', function (e) {
      var d = e.target.closest('.yr-yer'); if (!d) return;
      var ad = d.querySelector('.yr-ad').value.trim();
      if (!ad) { yonetMesaj('Yer adı boş olamaz.'); yonetCiz(); return; }
      islemYap('yer_kaydet', { id: Number(d.getAttribute('data-yer')), ad: ad, tur: d.querySelector('.yr-tursec').value });
    });
    $('yr-liste').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-is]'); if (!b) return;
      var yer = yerKimlik(Number(b.closest('.yr-yer').getAttribute('data-yer'))), li = b.closest('li'), nid = li ? Number(li.getAttribute('data-nokta')) : 0;
      var is = b.getAttribute('data-is');
      if (is === 'yer-sil') { if (confirm('“' + yer.ad + '” yeri ve konumları silinsin mi? Log kayıtları silinmez.')) islemYap('yer_sil', { id: yer.id }); }
      else if (is === 'nokta-sil') { if (confirm('Bu konum silinsin mi?')) islemYap('nokta_sil', { id: nid }); }
      else if (is === 'nokta-duzenle') duzenle({ yerId: yer.id, noktaId: nid });
      else duzenle({ yerId: yer.id });
    });
    $('yp-yer').addEventListener('change', function () { yeniAlanlar(); cakisma(); });
    $('yp-yaricap').addEventListener('input', function () { $('yp-yaricap-yaz').textContent = this.value + ' m'; duzen.daire.setRadius(Number(this.value)); cakisma(); });
    $('yp-kaydet').addEventListener('click', kaydet);
    $('yp-git').addEventListener('click', koordGit);
    $('yp-koord').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); koordGit(); } });
    $('yp-vazgec').addEventListener('click', function () { duzenKapat(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && duzen) setTimeout(function () { duzenKapat(true); }, 0); });
    return yukle();
  }

  window.Yerler = {
    baslat: baslat, yukle: yukle, bul: bul, yakin: yakin, duzenle: duzenle, yonetAc: yonetAc,
    ikon: function (t) { return IKON[t] || IKON.diger; },
    degisince: function (f) { dinleyenler.push(f); },
    hazir: function () { return yukleme || yukle(); },
    liste: function () { return liste; }
  };
})();
