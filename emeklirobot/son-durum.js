/* "Son durum" kartları: her cihaz şu an nerede, ne zamandır duruyor, bugün ne yaptı. Ekran filtrelerinden bağımsızdır. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc;
  var kayitlar = null, uyarilar = {}, bilinen = [], mesgul = false, sonAlma = 0, hedefler = [];

  function sorgula(saatGeri) { return O.veriGetir(O.aralikSorgu(Date.now() - saatGeri * 3600e3, Date.now() + 3600e3)); }

  function yenile() {
    if (mesgul) return;
    mesgul = true; sonAlma = Date.now();
    Yerler.hazir().then(function () { return sorgula(72); })
      .then(function (v) { return v.kayitlar ? v : sorgula(24); })
      .then(function (v) { kayitlar = v.kayitlar || []; $('sd-mesaj').textContent = ''; ciz(); })
      .catch(function (e) { if (!e || e.kod !== 'oturum') $('sd-mesaj').textContent = 'Son durum alınamadı.'; })
      .then(function () { mesgul = false; });
  }
  function uyariYenile() {
    if (window.Bakim) Bakim.uyarilar().then(function (u) { uyarilar = u; ciz(); }, function () {});
  }

  function yerSatiri(c) {
    var k = c.sonKonum;
    if (!k) return 'Konum bilgisi yok';
    var y = Yerler.bul(k.lat, k.lon);
    if (y) return Yerler.ikon(y.tur) + ' <b>' + esc(y.ad) + '</b>';
    var n = Yerler.yakin(k.lat, k.lon);
    return 'Kayıtlı olmayan konum' + (n ? ' (' + esc(n.ad) + ' ' + O.metre(n.mesafe) + ' uzakta)' : '');
  }

  function durumu(c) {
    var simdi = Date.now(), yas = Math.max(0, simdi - c.son), b = c.sonBolum;
    if (c.sonTip === 'KONUM_ALINAMADI' || (b && b.tur === 'gps' && c.sonHareketli)) {
      return { tur: 'uy', ad: 'GPS yok', metin: 'GPS alınamıyor. Son kayıt ' + O.sure(yas) + ' önce.' };
    }
    if (c.sonHareketli) {
      if (yas <= 5 * 60e3) return { tur: 'yol', ad: 'Hareket halinde', metin: (b && b.tur === 'yol' ? O.saat(b.t0) + '’den beri yolda' : 'Yeni harekete geçti') + (c.sonHiz !== null ? ' · son hız ' + O.sayi(c.sonHiz) + ' km/sa' : '') + '.' };
      return { tur: 'eski', ad: 'Haber yok', metin: O.sure(yas) + ' önce hareket halindeydi; sonrasında kayıt gelmedi.' };
    }
    var basladi = b && b.tur === 'bekle' ? b.t0 : c.son, enAz = b && b.tur === 'bekle' && b.ilkVeri;
    if (yas <= Analiz.ayar.DURAGAN_BOSLUK) return { tur: 'dur', ad: 'Duruyor', metin: (enAz ? 'En az ' : '') + O.sure(simdi - basladi) + ' süredir duruyor (' + O.kisaTarih(basladi) + '’den beri).' };
    return { tur: 'eski', ad: 'Haber yok', metin: 'Son bilgi ' + O.sure(yas) + ' önce: duruyordu (' + O.kisaTarih(basladi) + ' – ' + O.kisaTarih(c.son) + ').' };
  }

  function bugunMetni(c) {
    var bas = O.gunBasi(O.istGun(Date.now())), g = null;
    c.gunler.forEach(function (x) { if (x.bas === bas) g = x; });
    return g && g.ozet.yolculuk ? 'Bugün ' + g.ozet.yolculuk + ' yolculuk, yaklaşık ' + O.km(g.ozet.mesafe) + ', ' + O.sure(g.ozet.surus) + ' sürüş.' : 'Bugün yolculuk kaydı yok.';
  }

  function dugme(veri, yazi) { hedefler.push(veri); return '<button type="button" class="az-git" data-sd="' + (hedefler.length - 1) + '">' + yazi + '</button>'; }
  function uyariHtml(ad) { return uyarilar[ad] ? '<p class="sd-bakim">🔧 ' + uyarilar[ad].map(esc).join('<br>🔧 ') + '</p>' : ''; }

  function kart(c) {
    var d = durumu(c), k = c.sonKonum, islemler = '';
    if (k) {
      islemler = dugme({ konum: [k.lat, k.lon], etiket: c.ad + ' son konum' }, 'Haritada') +
        // Bağlantıya tıklanınca konum Google Haritalar'a gider; tıklanmadan hiçbir şey gönderilmez
        '<a class="az-git" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + k.lat.toFixed(6) + ',' + k.lon.toFixed(6) + '" target="_blank" rel="noopener noreferrer" title="Google Haritalar’da açılır; konum Google’a gider">Yol tarifi al ↗</a>' +
        (Yerler.bul(k.lat, k.lon) ? '' : dugme({ kaydet: { lat: k.lat, lon: k.lon } }, 'Konumu kaydet'));
    }
    return '<article class="sd-kart sd-' + d.tur + '"><header><b>' + esc(c.ad) + '</b><span class="sd-rozet">' + d.ad + '</span></header>' +
      '<p class="sd-yer">' + yerSatiri(c) + '</p><p>' + esc(d.metin) + '</p><p class="sd-bugun">' + esc(bugunMetni(c)) + '</p>' + uyariHtml(c.ad) +
      '<div class="sd-islem">' + islemler + '</div></article>';
  }

  function ciz() {
    if (!kayitlar) return;
    hedefler = [];
    var sonuc = Analiz.coz(kayitlar, { hizSinir: 1000, yerBul: Yerler.bul, yakinBul: Yerler.yakin });
    var var_ = sonuc.map(function (c) { return c.ad; });
    var html = sonuc.map(kart).join('') + bilinen.filter(function (a) { return var_.indexOf(a) < 0; }).map(function (a) {
      return '<article class="sd-kart sd-eski"><header><b>' + esc(a) + '</b><span class="sd-rozet">Haber yok</span></header><p>Son 3 günde (yoğun veride son 24 saatte) kayıt yok.</p>' + uyariHtml(a) + '</article>';
    }).join('');
    $('sd-liste').innerHTML = html || '<p class="not">Henüz kayıt yok.</p>';
    $('sd-ozet').textContent = sonuc.map(function (c) { return c.ad + ': ' + durumu(c).ad.toLocaleLowerCase('tr-TR'); }).join(' · ');
  }

  function baslat() {
    var d = $('sd');
    try { if (localStorage.getItem('er_sd_kapali') === '1') d.open = false; } catch (e) {}
    d.addEventListener('toggle', function () { try { localStorage.setItem('er_sd_kapali', d.open ? '0' : '1'); } catch (e) {} });
    $('sd-liste').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sd]'); if (!b) return;
      var h = hedefler[Number(b.getAttribute('data-sd'))];
      if (h.kaydet) Yerler.duzenle(h.kaydet); else O.haritadaGoster(h);
    });
    Yerler.degisince(ciz);
    yenile(); uyariYenile();
    // Dakikada bir yeni veri (sekme görünürken); süre yazıları da böylece güncel kalır
    setInterval(function () { if (!document.hidden) yenile(); }, 60e3);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - sonAlma > 60e3) yenile(); });
  }

  window.SonDurum = {
    baslat: baslat, yenile: yenile, uyariYenile: uyariYenile,
    cihazlar: function (liste) { if (liste.join() !== bilinen.join()) { bilinen = liste.slice(); ciz(); } }
  };
})();
