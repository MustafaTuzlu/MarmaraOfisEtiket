/* "Darbe adayları": telefon sensörlerinin işaretlediği olaylar (özet + GPS izi). Salt okunur.
   Kaza tespiti değildir; eşikler doğrulanmamıştır. Gerçek durum ve not yalnız telefondan düzenlenir. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi;
  var ETIKET = { OLASI_DARBE: ['Olası darbe', 'kr'], TELEFON_DUSMESI_SUPHESI: ['Telefon düşmesi şüphesi', 'uy'], BELIRLENEMEDI: ['Belirlenemedi', ''] };
  var DURUM = { KASIS_CUKUR: 'Kasis / çukur', SERT_FREN: 'Sert fren', KAPI: 'Kapı çarpması', TELEFON: 'Telefona dokunma / düşme', CARPISMA: 'Çarpışma', BILINMIYOR: 'Bilinmiyor' };
  var KAYNAK = { ELAPSED: 'sunucu saatine göre düzeltildi', CIHAZ: 'telefon saat farkıyla düzeltildi', YOK: 'telefon saati (düzeltilemedi)' };
  // Varsayılan görünüm ("havuz"): doğrulanmış bir süzgeç DEĞİL; sayılar bir günlük veriye bakılarak seçildi. Kayıt silinmez.
  var HAVUZ = {
    HIZ_KMH: 20,    // seyirde: darbe öncesi GPS hızı en az bu kadar
    SARJ_SN: 60,    // park/duruşta: şarj takma/çıkarma loguna bu süreden yakınsa elenir (sınır dahil)
    LOG_SN: 1200    // araç durumu için son log en çok bu kadar eski olabilir (darbe.php ±1 saat bakar)
  };
  // Dönüş: elenme nedenleri; boş dizi = havuzda. Kural: tek örnek değil VE (seyirde YA DA duran araçta şarj değişiminden uzak)
  function elenme(o) {
    var c = o.cevre || {}, hiz = o.veri.hizOnceKmh, neden = [];
    var hizVar = hiz !== null && hiz !== undefined, seyir = hizVar && hiz >= HAVUZ.HIZ_KMH;
    var bilinen = c.sonLogSn !== null && c.sonLogSn !== undefined && c.sonLogSn <= HAVUZ.LOG_SN && c.sonHareketli !== null;
    var yakinSarj = c.sarjFarkSn !== null && c.sarjFarkSn !== undefined && Math.abs(c.sarjFarkSn) <= HAVUZ.SARJ_SN;
    var park = bilinen && c.sonHareketli === false && !yakinSarj;
    if (o.veri.tekOrnek === true) neden.push('tek örnek');
    if (!seyir && !park) {
      neden.push(hizVar ? 'hız ' + HAVUZ.HIZ_KMH + ' km/sa altı' : 'hız bilinmiyor');
      if (!bilinen) neden.push('araç durumu bilinmiyor');
      else if (c.sonHareketli) neden.push('araç hareketli');
      if (yakinSarj) neden.push((c.sarjTip === 'SARJ_BASLADI' ? 'şarj başlamasına' : 'şarj kesilmesine') + ' yakın (' + Math.abs(c.sarjFarkSn) + ' sn ' + (c.sarjFarkSn > 0 ? 'önce' : 'sonra') + ')');
    }
    return neden;
  }
  var olaylar = [], toplam = 0, acik = null, no = 0, detayNo = 0, hedef = null;

  var tamBicim = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function tarih(sn) { return sn === null ? '—' : tamBicim.format(new Date(sn * 1000)); }
  function deger(v, birim, k) { return v === null || v === undefined ? '—' : sayi(v, k || 0) + (birim ? ' ' + birim : ''); }
  function evet(v) { return v === null || v === undefined ? '—' : (v ? 'Evet' : 'Hayır'); }
  function cip(yazi, tur) { return '<span class="az-cip' + (tur ? ' ' + tur : '') + '">' + esc(yazi) + '</span>'; }
  function etiketCip(o) { var e = ETIKET[o.etiket] || [o.etiket, '']; return cip(e[0], e[1]) + (o.asama === 'TAMAM' ? '' : ' ' + cip('yarım')); }
  function durumAdi(o) { return o.gercekDurum ? (DURUM[o.gercekDurum] || o.gercekDurum) : '—'; }
  function mesaj(t) { $('dr-mesaj').textContent = t || ''; }
  function hataYaz(e) {
    if (e && e.kod === 'tablo_yok') return 'Darbe tablosu henüz oluşturulmamış. phpMyAdmin’de db/2026-11-28-darbe.sql dosyasını bir kez çalıştırın.';
    return 'Darbe adayları alınamadı. Tekrar deneyin.';
  }

  function suzulmus() {
    var c = $('dr-cihaz').value, e = $('dr-etiket').value;
    return olaylar.filter(function (o) { return (!c || o.cihaz === c) && (!e || o.etiket === e); });
  }
  function hepsiAcik() { return $('dr-hepsi').checked; }
  function gorunen() { return suzulmus().filter(function (o) { return hepsiAcik() || !elenme(o).length; }); }
  function havuzBilgi() {
    var S = suzulmus(), e = S.filter(function (o) { return elenme(o).length; }).length;
    return '<p class="az-uyari">' + (hepsiAcik() ? 'Tüm kayıtlar gösteriliyor: ' + (S.length - e) + ' havuzda, ' + e + ' elenmiş.' : 'Havuz görünümü: ' + (S.length - e) + ' kayıt gösteriliyor, ' + e + ' kayıt gizli.') +
      ' Bu <b>doğrulanmış bir süzgeç değildir</b> (sayılar bir günlük veriye bakılarak seçildi); gerçek bir darbe de elenebilir. Hiçbir kayıt silinmez. Havuza giren: tek örnek olmayan olaylardan, darbe öncesi hızı en az ' +
      HAVUZ.HIZ_KMH + ' km/sa olanlar ile araç dururken olup şarj takma/çıkarmaya ' + HAVUZ.SARJ_SN + ' sn’den uzak olanlar. Geç ulaşan loglar sonucu değiştirebilir.</p>';
  }

  function listeCiz() {
    if (acik) return;
    var L = gorunen(), S = suzulmus();
    $('dr-excel').disabled = !L.length;
    if (!L.length) { $('dr-icerik').innerHTML = (S.length ? havuzBilgi() : '') + '<p class="not">' + (S.length ? 'Havuzda kayıt yok. Elenen kayıtlar için “Elenenleri göster”i işaretleyin.' : (olaylar.length ? 'Bu süzgece uyan olay yok.' : 'Henüz sunucuya ulaşan darbe adayı yok.')) + '</p>'; return; }
    $('dr-icerik').innerHTML = havuzBilgi() + (toplam > olaylar.length ? '<p class="not">Toplam ' + sayi(toplam) + ' olaydan en yeni ' + sayi(olaylar.length) + ' tanesi gösteriliyor.</p>' : '') +
      '<div class="rp-tablo"><table><thead><tr><th></th><th>Zaman</th><th>Cihaz</th><th>Etiket</th><th>Tepe</th><th>Süre</th><th>Δv (yaklaşık)</th><th>Hız: önce → 10 sn</th><th>Gerçek durum</th></tr></thead><tbody>' +
      L.map(function (o) {
        var v = o.veri, n = elenme(o);
        return '<tr><td><button type="button" class="az-git" data-is="ac" data-no="' + o.no + '">İncele</button></td><td>' + tarih(o.zaman) + '</td><td>' + esc(o.cihaz) + '</td><td>' + etiketCip(o) + (n.length ? '<small class="dr-neden">Elendi: ' + esc(n.join('; ')) + '</small>' : '') + '</td><td><b>' + deger(o.tepeG, 'G', 1) + '</b>' + (v.doymus ? ' ' + cip('doymuş', 'uy') : '') + '</td>' +
          '<td>' + deger(v.sureMs, 'ms') + '</td><td>' + deger(v.deltaVKmh, 'km/sa', 1) + '</td><td>' + deger(v.hizOnceKmh) + ' → ' + deger(v.hiz10Kmh, 'km/sa') + '</td><td>' + esc(durumAdi(o)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function tablo(satirlar) {
    return '<dl class="dr-dl">' + satirlar.map(function (s) { return '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>'; }).join('') + '</dl>';
  }
  // gps satırı: [tMs, enlem, boylam, hizKmh, yon, dogruluk, uydu, reddedildi]; tMs en yüksek tepeye göredir
  function haritaVerisi(o, gps) {
    if (!gps.length) return null;
    var tepeMs = o.zaman * 1000 + (o.veri.tepeFarkMs || 0);
    var sirali = gps.slice().sort(function (a, b) { return a[0] - b[0]; });
    var iyi = sirali.filter(function (p) { return !p[7]; });
    var yakin = sirali.reduce(function (a, b) { return Math.abs(b[0]) < Math.abs(a[0]) ? b : a; });
    var iz = iyi.map(function (p) { return { t: tepeMs + p[0], lat: p[1], lon: p[2], hiz: p[3] }; });
    var sn = sayi(Math.abs(yakin[0]) / 1000, 1) + ' sn ' + (yakin[0] < 0 ? 'önce' : 'sonra');
    var h = {
      etiket: 'Darbe adayı ' + tarih(o.zaman) + ' · ' + o.cihaz + ' — “!” tepeye en yakın GPS noktası (' + sn + (yakin[7] ? ', kalite süzgeci reddetti' : '') + ')',
      duraklar: [{ no: '!', konum: [yakin[1], yakin[2]], etiket: 'Tepeye en yakın GPS noktası: ' + sn }]
    };
    if (iz.length > 1) { h.iz = iz; h.nokta = iz.map(function (p) { return [p.lat, p.lon]; }); }
    else h.konum = [yakin[1], yakin[2]];
    return h;
  }

  function detayCiz(o, gps) {
    var v = o.veri, reddedilen = gps.filter(function (p) { return p[7]; }).length;
    hedef = haritaVerisi(o, gps);
    $('dr-icerik').innerHTML = '<p class="dr-ust"><button type="button" class="az-git" data-is="liste">← Listeye dön</button> ' +
      (hedef ? '<button type="button" class="analiz-btn" data-is="harita">Haritada göster</button>' : '<span class="not">Bu olayda GPS noktası yok.</span>') + '</p>' +
      '<h3 class="dr-baslik">' + tarih(o.zaman) + ' · ' + esc(o.cihaz) + ' ' + etiketCip(o) + '</h3>' +
      '<p class="not">' + (elenme(o).length ? 'Havuz süzgecinde elendi: ' + esc(elenme(o).join('; ')) + '.' : 'Havuz süzgecinde: havuzda.') + ' (Doğrulanmış bir süzgeç değildir.)</p>' +
      (o.asama === 'TAMAM' ? '' : '<p class="az-uyari">Olay kaydı yarım (aşama: ' + esc(o.asama) + '). Sonraki değerler eksik olabilir.</p>') +
      '<div class="az-bolum"><h4>Telefonda işaretlenen</h4>' + tablo([['Gerçek durum', esc(durumAdi(o))], ['Not', v.not ? esc(v.not) : '—']]) + '</div>' +
      '<div class="az-bolum"><h4>Sensör özeti</h4>' + tablo([
        ['Tepe', deger(o.tepeG, 'G', 2)], ['Süre', deger(v.sureMs, 'ms')], ['Δv (yaklaşık)', deger(v.deltaVKmh, 'km/sa', 1)], ['Tetikleme sayısı', deger(v.tetikleme)],
        ['Tek örnek', evet(v.tekOrnek)], ['Sensör tavana dayandı', evet(v.doymus)], ['Önceki serbest düşüş', deger(v.serbestDususMs, 'ms')],
        ['En yüksek açısal hız', deger(v.enYuksekAcisalHizDps, '°/sn')], ['Yön değişimi', deger(v.yonDegisimiDerece, '°')], ['Basınç değişimi', deger(v.basincDegisimiHpa, 'hPa', 2)],
        ['Sensör', v.sensor ? esc(v.sensor) : '—']]) + '</div>' +
      '<div class="az-bolum"><h4>GPS hızı (telefonun hesabı)</h4>' + tablo([
        ['Önce', deger(v.hizOnceKmh, 'km/sa', 1)], ['10 sn sonra', deger(v.hiz10Kmh, 'km/sa', 1)], ['60 sn sonra', deger(v.hiz60Kmh, 'km/sa', 1)], ['120 sn sonra', deger(v.hiz120Kmh, 'km/sa', 1)],
        ['Belirgin hız kaybı', evet(v.belirginHizKaybi)]]) + '</div>' +
      '<div class="az-bolum"><h4>Kayıt bilgisi</h4>' + tablo([
        ['Zaman', esc(KAYNAK[o.zamanKaynagi] || o.zamanKaynagi)], ['Telefon saati', tarih(o.telefonZamani)], ['Sunucuya ilk ulaşma', tarih(o.ilkAlinma)], ['Son güncelleme', tarih(o.sonAlinma)],
        ['Uygulama sürümü', v.uygulama ? esc(v.uygulama) : '—']]) + '</div>' +
      (gps.length ? '<details class="dr-gps"><summary>GPS noktaları (' + gps.length + (reddedilen ? ', ' + reddedilen + ' tanesi reddedilmiş; haritadaki çizgiye girmez' : '') + ')</summary><div class="rp-tablo"><table><thead><tr><th>Tepeye göre</th><th>Enlem</th><th>Boylam</th><th>Hız</th><th>Doğruluk</th><th>Uydu</th><th></th></tr></thead><tbody>' +
        gps.map(function (p) {
          return '<tr><td>' + (p[0] > 0 ? '+' : '') + sayi(p[0] / 1000, 1) + ' sn</td><td>' + p[1].toFixed(6) + '</td><td>' + p[2].toFixed(6) + '</td><td>' + deger(p[3], 'km/sa', 1) + '</td><td>' + deger(p[5], 'm') + '</td><td>' + deger(p[6]) + '</td><td>' + (p[7] ? cip('reddedildi', 'uy') : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></details>' : '');
  }

  function detayAc(n) {
    var x = ++detayNo;
    acik = n; hedef = null; mesaj('Yükleniyor…'); $('dr-excel').disabled = true;
    O.istek('/emeklirobot/darbe.php?islem=olay&no=' + n).then(function (v) {
      if (x !== detayNo) return;
      mesaj(''); detayCiz(v.olay, v.gps);
      $('drmodal').querySelector('.modal-kutu').scrollTop = 0;
    }).catch(function (e) { if (x === detayNo) { acik = null; listeCiz(); mesaj(hataYaz(e)); } });
  }
  function listeyeDon() { detayNo++; acik = null; hedef = null; mesaj(''); listeCiz(); }

  function yukle() {
    var x = ++no;
    listeyeDon(); mesaj('Yükleniyor…'); $('dr-icerik').innerHTML = ''; $('dr-excel').disabled = true;
    O.istek('/emeklirobot/darbe.php?islem=liste').then(function (v) {
      if (x !== no) return;
      olaylar = v.olaylar; toplam = v.toplam; mesaj('');
      var secili = $('dr-cihaz').value, adlar = [];
      olaylar.forEach(function (o) { if (adlar.indexOf(o.cihaz) < 0) adlar.push(o.cihaz); });
      $('dr-cihaz').innerHTML = '<option value="">Tüm cihazlar</option>' + adlar.sort().map(function (c) { return '<option' + (c === secili ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      listeCiz();
    }).catch(function (e) { if (x === no) { olaylar = []; mesaj(hataYaz(e)); } });
  }

  function excel() {
    var L = gorunen(), gun = O.istGun(Date.now());
    function zaman(sn) { return sn === null ? null : new Date(sn * 1000); }
    function b(v) { return v === null || v === undefined ? null : (v ? 'Evet' : 'Hayır'); }
    function s(v) { return v === undefined ? null : v; }
    Rapor.ic.indir(['Zaman', 'Cihaz', 'Etiket', 'Aşama', 'Tepe (G)', 'Süre (ms)', 'Δv (km/sa)', 'Tetikleme', 'Tek örnek', 'Doymuş', 'Serbest düşüş (ms)', 'Açısal hız (°/sn)', 'Hız önce', 'Hız 10 sn', 'Hız 60 sn', 'Hız 120 sn', 'Belirgin hız kaybı', 'Gerçek durum', 'Not', 'GPS noktası', 'Uygulama', 'Havuzda', 'Elenme nedeni'],
      L.map(function (o) {
        var v = o.veri;
        return [zaman(o.zaman), o.cihaz, (ETIKET[o.etiket] || [o.etiket])[0], o.asama, o.tepeG, s(v.sureMs), s(v.deltaVKmh), s(v.tetikleme), b(v.tekOrnek), b(v.doymus), s(v.serbestDususMs), s(v.enYuksekAcisalHizDps), s(v.hizOnceKmh), s(v.hiz10Kmh), s(v.hiz60Kmh), s(v.hiz120Kmh), b(v.belirginHizKaybi), o.gercekDurum ? durumAdi(o) : null, s(v.not), o.gpsAdet, s(v.uygulama), b(!elenme(o).length), elenme(o).join('; ') || null];
      }), [20, 16, 24, 8, 10, 10, 11, 10, 10, 9, 14, 14, 9, 9, 9, 10, 14, 22, 40, 10, 10, 9, 50], 'Darbe-adaylari', { bas: gun, bit: gun });
  }

  function baslat() {
    O.pencere('drmodal', 'drkapat', function () { no++; detayNo++; });
    $('dr-cihaz').addEventListener('change', function () { listeyeDon(); });
    $('dr-etiket').addEventListener('change', function () { listeyeDon(); });
    $('dr-hepsi').addEventListener('change', function () { listeyeDon(); });
    $('dr-yenile').addEventListener('click', yukle);
    $('dr-excel').addEventListener('click', excel);
    $('dr-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-is]'); if (!b) return;
      var is = b.getAttribute('data-is');
      if (is === 'ac') detayAc(Number(b.getAttribute('data-no')));
      else if (is === 'liste') listeyeDon();
      else if (is === 'harita' && hedef) O.haritadaGoster(hedef);
    });
  }
  function ac() { $('drmodal').hidden = false; yukle(); }

  window.Darbe = { baslat: baslat, ac: ac };
})();
