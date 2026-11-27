/* Bakım hatırlatıcı: elle girilen kilometre + o andan sonraki GPS mesafesi (günlük özetlerdeki yolculuklar). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi;
  var YAKIN_KM = 500, YAKIN_GUN = 14;
  var model = null, cihazlar = [], duzenlenen = null;

  function gunYaz(g) { return g.slice(8) + '.' + g.slice(5, 7) + '.' + g.slice(0, 4); }
  function ayEkle(gun, ay) {
    var d = new Date(gun + 'T12:00:00Z'), hedef = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + ay);
    d.setUTCDate(Math.min(hedef, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
    return d.toISOString().slice(0, 10);
  }

  // Sunucudan araç/bakım listesini alır ve her aracın tahmini kilometresini hesaplar
  function getir() {
    return O.ozellik('bakim').then(function (v) {
      if (!v.araclar.length) return { araclar: {}, bakimlar: v.bakimlar };
      var enEski = Math.min.apply(null, v.araclar.map(function (a) { return a.zaman; })) * 1000;
      return O.istek('/emeklirobot/ozellik.php?islem=ozetler&bas=' + O.gunEkle(O.istGun(enEski), -1) + '&bit=' + O.istGun(Date.now())).then(function (o) {
        var araclar = {};
        v.araclar.forEach(function (a) {
          var m = 0;
          o.gunler.forEach(function (g) {
            if (g.cihaz !== a.cihaz) return;
            (g.veri.yol || []).forEach(function (y) { if (y[0] >= a.zaman) m += y[2]; });
          });
          araclar[a.cihaz] = { taban: a.km, zaman: a.zaman * 1000, gps: m / 1000, km: a.km + m / 1000, eksik: o.kesildi };
        });
        return { araclar: araclar, bakimlar: v.bakimlar };
      });
    });
  }

  function degerlendir(b, arac) {
    var parca = [], durum = 'tamam';
    function yukselt(d) { if (d === 'gecti' || (d === 'yakin' && durum !== 'gecti')) durum = d; else if (d === 'bilinmiyor' && durum === 'tamam') durum = d; }
    if (b.aralikKm !== null) {
      if (b.sonKm === null || !arac) { parca.push(!arac ? 'km takibi için aracın kilometresini girin' : 'son yapılan km girilmemiş'); yukselt('bilinmiyor'); }
      else {
        var kalan = b.sonKm + b.aralikKm - arac.km;
        parca.push(kalan < 0 ? sayi(-kalan) + ' km geçti' : sayi(kalan) + ' km kaldı (' + sayi(b.sonKm + b.aralikKm) + ' km’de)');
        if (kalan < 0) yukselt('gecti'); else if (kalan <= YAKIN_KM) yukselt('yakin');
      }
    }
    if (b.aralikAy !== null) {
      if (!b.sonTarih) { parca.push('son yapılan tarih girilmemiş'); yukselt('bilinmiyor'); }
      else {
        var hedef = ayEkle(b.sonTarih, b.aralikAy), gun = Math.round((O.gunBasi(hedef) - O.gunBasi(O.istGun(Date.now()))) / 864e5);
        parca.push(gun < 0 ? (-gun) + ' gün geçti' : gun + ' gün kaldı (' + gunYaz(hedef) + ')');
        if (gun < 0) yukselt('gecti'); else if (gun <= YAKIN_GUN) yukselt('yakin');
      }
    }
    return { durum: durum, metin: parca.join(' · ') };
  }

  // Son durum kartındaki uyarılar (saklı özetlerle; yeniden hesaplama yapmaz)
  function uyarilar() {
    return getir().then(function (m) {
      var u = {};
      m.bakimlar.forEach(function (b) {
        var d = degerlendir(b, m.araclar[b.cihaz]);
        if (d.durum === 'gecti' || d.durum === 'yakin') (u[b.cihaz] = u[b.cihaz] || []).push(b.ad + ': ' + d.metin);
      });
      return u;
    });
  }

  function mesaj(t) { $('bk-mesaj').textContent = t || ''; }

  function formHtml(c) {
    var b = duzenlenen && duzenlenen.cihaz === c ? duzenlenen : null, v = function (x) { return x === null || x === undefined ? '' : esc(x); };
    return '<form class="bk-form" data-cihaz="' + esc(c) + '"><b>' + (b ? 'Bakım maddesini düzenle' : 'Yeni bakım maddesi') + '</b><div class="satir">' +
      '<label>Ad <input name="ad" list="bk-adlar" maxlength="60" required value="' + (b ? esc(b.ad) : '') + '"></label>' +
      '<label>Kaç km’de bir <input name="aralikKm" type="number" min="1" max="1000000" value="' + v(b && b.aralikKm) + '"></label>' +
      '<label>Kaç ayda bir <input name="aralikAy" type="number" min="1" max="600" value="' + v(b && b.aralikAy) + '"></label>' +
      '<label>Son yapıldığı km <input name="sonKm" type="number" min="0" max="5000000" value="' + v(b && b.sonKm) + '"></label>' +
      '<label>Son yapıldığı tarih <input name="sonTarih" type="date" value="' + v(b && b.sonTarih) + '"></label></div>' +
      '<button type="submit" class="analiz-btn">' + (b ? 'Güncelle' : 'Ekle') + '</button>' + (b ? ' <button type="button" class="az-git" data-is="vazgec">Vazgeç</button>' : '') + '</form>';
  }

  function ciz() {
    if (!model) return;
    var adlar = cihazlar.slice();
    Object.keys(model.araclar).concat(model.bakimlar.map(function (b) { return b.cihaz; })).forEach(function (c) { if (adlar.indexOf(c) < 0) adlar.push(c); });
    var RENK = { gecti: 'kr', yakin: 'uy', tamam: 'ok', bilinmiyor: '' }, AD = { gecti: 'Zamanı geçti', yakin: 'Yaklaştı', tamam: 'Tamam', bilinmiyor: 'Eksik bilgi' };
    $('bk-icerik').innerHTML = adlar.sort().map(function (c) {
      var a = model.araclar[c], B = model.bakimlar.filter(function (b) { return b.cihaz === c; });
      return '<div class="az-bolum bk-arac" data-cihaz="' + esc(c) + '"><h4>' + esc(c) + '</h4>' +
        (a ? '<p class="bk-km"><strong>≈ ' + sayi(a.km) + ' km</strong> <small>' + O.kisaTarih(a.zaman) + '’te girilen ' + sayi(a.taban) + ' km + GPS ile ' + sayi(a.gps, 1) + ' km</small></p>' : '<p>Kilometre takibi için aracın göstergesindeki değeri girin.</p>') +
        '<div class="bk-km-gir"><input type="number" min="0" max="5000000" placeholder="Göstergedeki km" aria-label="Göstergedeki kilometre"><button type="button" class="az-git" data-is="km">Kilometreyi kaydet</button></div>' +
        (B.length ? '<ul class="bk-liste">' + B.map(function (b) {
          var d = degerlendir(b, a);
          return '<li data-id="' + b.id + '"><span class="az-cip ' + RENK[d.durum] + '">' + AD[d.durum] + '</span> <b>' + esc(b.ad) + '</b> <small>' + esc(d.metin) + '</small>' +
            '<span class="bk-islem"><button type="button" class="az-git" data-is="yapildi">Bugün yapıldı</button><button type="button" class="az-git" data-is="duzenle">Düzenle</button><button type="button" class="az-git yr-kirmizi" data-is="sil">Sil</button></span></li>';
        }).join('') + '</ul>' : '') + formHtml(c) + '</div>';
    }).join('') || '<p class="not">Henüz kayıt gönderen cihaz yok.</p>';
  }

  function yenile() { return getir().then(function (m) { model = m; ciz(); }); }
  function islem(ad, govde) {
    mesaj('Kaydediliyor…');
    return O.ozellik(ad, govde).then(function () { duzenlenen = null; return yenile(); }).then(function () { mesaj(''); SonDurum.uyariYenile(); })
      .catch(function (e) { mesaj(O.hataMetni(e)); });
  }

  function ac() {
    model = null; duzenlenen = null; $('bk-icerik').innerHTML = ''; mesaj('Kilometre hesaplanıyor…');
    $('bkmodal').hidden = false;
    // Güncel mesafe için önce eksik günlük özetler tamamlanır
    Rapor.senkron(mesaj).then(function (s) { cihazlar = s.cihazlar; return yenile(); }).then(function () { mesaj(''); })
      .catch(function (e) { mesaj(O.hataMetni(e)); });
  }

  function bul(id) { for (var i = 0; i < model.bakimlar.length; i++) if (model.bakimlar[i].id === id) return model.bakimlar[i]; return null; }

  function baslat() {
    O.pencere('bkmodal', 'bkkapat');
    $('bk-icerik').addEventListener('click', function (e) {
      var d = e.target.closest('button[data-is]'); if (!d) return;
      var is = d.getAttribute('data-is'), kutu = d.closest('.bk-arac'), c = kutu.getAttribute('data-cihaz'), li = d.closest('li');
      var b = li ? bul(Number(li.getAttribute('data-id'))) : null;
      if (is === 'km') {
        var g = kutu.querySelector('.bk-km-gir input'), n = Number(g.value);
        if (g.value === '' || !(n >= 0 && n <= 5000000)) { mesaj('Geçerli bir kilometre yazın.'); g.focus(); return; }
        islem('arac_kaydet', { cihaz: c, km: Math.round(n) });
      } else if (is === 'yapildi') {
        var a = model.araclar[c];
        if (confirm('“' + b.ad + '” bugün' + (a ? ' ' + sayi(a.km) + ' km’de' : '') + ' yapıldı olarak kaydedilsin mi?')) {
          islem('bakim_kaydet', { id: b.id, cihaz: c, ad: b.ad, aralikKm: b.aralikKm, aralikAy: b.aralikAy, sonKm: a ? Math.round(a.km) : b.sonKm, sonTarih: O.istGun(Date.now()) });
        }
      } else if (is === 'duzenle') { duzenlenen = b; ciz(); }
      else if (is === 'vazgec') { duzenlenen = null; ciz(); }
      else if (is === 'sil') { if (confirm('“' + b.ad + '” maddesi silinsin mi?')) islem('bakim_sil', { id: b.id }); }
    });
    $('bk-icerik').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, c = f.getAttribute('data-cihaz');
      function s(ad) { var v = f.elements[ad].value; return v === '' ? null : Math.round(Number(v)); }
      var govde = { id: duzenlenen && duzenlenen.cihaz === c ? duzenlenen.id : 0, cihaz: c, ad: f.elements.ad.value.trim(), aralikKm: s('aralikKm'), aralikAy: s('aralikAy'), sonKm: s('sonKm'), sonTarih: f.elements.sonTarih.value || null };
      if (!govde.ad) { mesaj('Bakım adı yazın.'); return; }
      if (govde.aralikKm === null && govde.aralikAy === null) { mesaj('Km ya da ay aralığından en az birini yazın.'); return; }
      islem('bakim_kaydet', govde);
    });
  }

  window.Bakim = { baslat: baslat, ac: ac, uyarilar: uyarilar };
})();
