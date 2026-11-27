/* Masraf defteri: harcama girişi, toplamlar, km başı maliyet, yakıt tüketimi ve yolculukların km maliyeti dökümü. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi;
  var AD = { yakit: 'Yakıt', otopark: 'Otopark', kopru: 'Köprü/otoyol', bakim: 'Bakım/onarım', diger: 'Diğer' };
  var liste = [], tumu = [], veri = null, cihazlar = [], duzenlenen = null, no = 0, sonDonem = null;
  var SATIR = 200;
  function tl(n) { return sayi(n, 2) + ' TL'; }
  function mesaj(t) { $('ms-mesaj').textContent = t || ''; }
  function I() { return Rapor.ic; }

  // <input type="datetime-local"> değeri Türkiye saati sayılır
  function girdiMs(v) { var m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)/.exec(v || ''); return m ? O.gunBasi(m[1]) + (Number(m[2]) * 60 + Number(m[3])) * 60e3 : null; }
  function msGirdi(t) { return new Date(t + 3 * 3600e3).toISOString().slice(0, 16); }
  // bas/bit: gün (masraf kayıtları ve özetler); t0/t1: yolculukları süzen anlar
  function donem() {
    if ($('ms-donem').value === 'ozel') {
      var a = girdiMs($('ms-bas').value), b = girdiMs($('ms-bit').value);
      if (a === null) a = O.gunBasi(O.istGun(Date.now()));
      if (b === null) b = Math.floor(Date.now() / 60e3) * 60e3;
      if (a > b) { var x = a; a = b; b = x; }
      return { bas: O.istGun(a), bit: O.istGun(b), t0: a, t1: b + 59999, ozel: true };
    }
    var g = gunDonemi();
    return { bas: g.bas, bit: g.bit, t0: O.gunBasi(g.bas), t1: O.gunBasi(O.gunEkle(g.bit, 1)) - 1, ozel: false };
  }
  // "Özel" seçilince kutular, az önce bakılan dönemle dolar
  function donemDegisti() {
    var ozel = $('ms-donem').value === 'ozel';
    if (ozel && sonDonem) {
      $('ms-bas').value = msGirdi(sonDonem.t0);
      $('ms-bit').value = msGirdi(Math.min(sonDonem.t1, Date.now()));
    }
    $('ms-ozel').hidden = !ozel;
    yukle();
  }
  function gunDonemi() {
    var bugun = O.istGun(Date.now()), s = $('ms-donem').value, ayBas = bugun.slice(0, 8) + '01';
    if (s === 'gecenay') { var son = O.gunEkle(ayBas, -1); return { bas: son.slice(0, 8) + '01', bit: son }; }
    if (s === 'ay') return { bas: ayBas, bit: bugun };
    if (s === 'yil') return { bas: bugun.slice(0, 4) + '-01-01', bit: bugun };
    return { bas: O.gunEkle(bugun, -(Number(s) - 1)), bit: bugun };
  }
  function suz(L_) { var c = $('ms-cihaz').value; return c ? L_.filter(function (m) { return m.cihaz === c; }) : L_; }

  // Yakıt tüketimi (depo-dolu yöntemi): ardışık km'li yakıt alımları arasında alınan litre / gidilen km
  function tuketim(c) {
    var Y = tumu.filter(function (m) { return m.cihaz === c && m.tur === 'yakit' && m.km !== null && m.litre !== null; }).sort(function (a, b) { return a.km - b.km; });
    if (Y.length < 2) return null;
    var yol = Y[Y.length - 1].km - Y[0].km, litre = Y.slice(1).reduce(function (t, m) { return t + m.litre; }, 0), tutar = Y.slice(1).reduce(function (t, m) { return t + m.tutar; }, 0);
    return yol > 0 ? { yuz: litre / yol * 100, tlKm: tutar / yol, yol: yol, adet: Y.length } : null;
  }

  // Seçili aralıkta başlayan bütün yolculuklar (tür ayrımı yok), eskiden yeniye
  function yollar() {
    var d = sonDonem;
    return veri && d ? veri.yol.filter(function (y) { return y.t0 >= d.t0 && y.t0 <= d.t1; }).slice().reverse() : [];
  }
  function ucAdi(u) { return u ? u.ad : '?'; }

  function formHtml() {
    var m = duzenlenen, v = function (x) { return x === null || x === undefined ? '' : esc(x); };
    return '<form id="ms-form" class="bk-form"><b>' + (m ? 'Masrafı düzenle' : 'Yeni masraf') + '</b><div class="satir">' +
      '<label>Cihaz/araç <select name="cihaz">' + cihazlar.map(function (c) { return '<option' + (m && m.cihaz === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Tarih <input type="date" name="tarih" required value="' + (m ? m.tarih : O.istGun(Date.now())) + '"></label>' +
      '<label>Tür <select name="tur">' + Object.keys(AD).map(function (t) { return '<option value="' + t + '"' + (m && m.tur === t ? ' selected' : '') + '>' + AD[t] + '</option>'; }).join('') + '</select></label>' +
      '<label>Tutar (TL) <input type="number" name="tutar" step="0.01" min="0" max="10000000" required inputmode="decimal" value="' + v(m && m.tutar) + '"></label>' +
      '<label>Litre (yakıt) <input type="number" name="litre" step="0.01" min="0" max="5000" inputmode="decimal" value="' + v(m && m.litre) + '"></label>' +
      '<label>Gösterge km <input type="number" name="km" step="1" min="0" max="5000000" inputmode="numeric" value="' + v(m && m.km) + '"></label>' +
      '<label>Not <input name="not" maxlength="200" value="' + v(m && m.not) + '"></label></div>' +
      '<button type="submit" class="analiz-btn">' + (m ? 'Güncelle' : 'Ekle') + '</button>' + (m ? ' <button type="button" class="az-git" data-is="vazgec">Vazgeç</button>' : '') + '</form>';
  }

  // Km başı yakıt: litre fiyatı × (100 km’de litre ÷ 100)
  function yakit() {
    var a = I().ayarlar(), fiyat = a.yakit_fiyat || 0, yuz = a.yakit_100km || 0;
    return { fiyat: fiyat, yuz: yuz, litre: yuz / 100, tl: fiyat * yuz / 100 };
  }
  function masrafToplami() {
    var L_ = suz(liste), toplam = 0, tur = {};
    L_.forEach(function (m) { toplam += m.tutar; tur[m.tur] = (tur[m.tur] || 0) + m.tutar; });
    return { liste: L_, toplam: toplam, tur: tur };
  }
  function yolKm() { return yollar().reduce(function (t, y) { return t + y.m; }, 0) / 1000; }
  function kartlarHtml() {
    var M = masrafToplami(), gpsKm = yolKm(), f = yakit();
    return [['Toplam masraf', tl(M.toplam), M.liste.length + ' kayıt'], ['GPS ile yol', sayi(gpsKm, 1) + ' km', 'GPS’siz yol dahil değil'], ['GPS km başına', gpsKm >= 1 && M.toplam ? tl(M.toplam / gpsKm) : '—', 'girilen masraf ÷ GPS km'],
      ['Yolun km maliyeti', f.tl ? tl(gpsKm * f.tl) : '—', f.tl ? 'yakıt: ' + sayi(gpsKm, 1) + ' km × ' + tl(f.tl) + ' · ' + sayi(gpsKm * f.litre, 2) + ' L' : 'aşağıdan yakıt fiyatı ve tüketim girin']]
      .concat(Object.keys(M.tur).map(function (t) { return [AD[t] || t, tl(M.tur[t]), '']; }))
      .map(function (k) { return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong><small>' + k[2] + '</small></div>'; }).join('');
  }
  // Girdilere bağlı kısım; yazarken yalnızca burası ve kartlar yenilenir (kutular ve masraf formu bozulmaz)
  function sonucHtml() {
    var Y = yollar(), gpsKm = yolKm(), f = yakit();
    return (f.tl ? '<p>Km başına <b>' + sayi(f.litre, 3) + ' L</b> yakıt = <b>' + tl(f.tl) + '</b></p>' : '<p class="not">Km başı maliyet için iki alanı da doldurun.</p>') +
      '<p><b>' + Y.length + ' yolculuk · ' + sayi(gpsKm, 1) + ' km' + (f.tl ? ' · ' + sayi(gpsKm * f.litre, 2) + ' L · ' + tl(gpsKm * f.tl) : '') + '</b></p>' +
      (Y.length ? '<p><button type="button" class="az-git" data-is="dokum">Yolculuk dökümünü Excel indir</button></p>' +
        '<details class="ms-yollar"><summary>Hesaba giren yolculuklar</summary>' + I().tablo(['Başlangıç', 'Araç', 'Güzergâh', 'Km', 'Yakıt (L)', 'Maliyet'], Y.slice(-SATIR).reverse().map(function (y) {
          var k = y.m / 1000;
          return [esc(O.kisaTarih(y.t0)), esc(y.cihaz), '<span class="db-sar">' + esc(ucAdi(y.nereden) + ' → ' + ucAdi(y.nereye)) + '</span>', sayi(k, 1), f.tl ? sayi(k * f.litre, 2) : '—', f.tl ? tl(k * f.tl) : '—'];
        })) + (Y.length > SATIR ? '<p class="not">Son ' + SATIR + ' yolculuk gösteriliyor; tamamı Excel’de.</p>' : '') + '</details>' : '');
  }
  function detayKoru(kutu, html) {
    var acik = !!kutu.querySelector('.ms-yollar[open]');
    kutu.innerHTML = html;
    if (acik && kutu.querySelector('.ms-yollar')) kutu.querySelector('.ms-yollar').open = true;
  }
  function yakitKutusu(id, etiket, deger, en, ornek) {
    return '<label>' + etiket + ' <input type="number" id="' + id + '" min="0" max="' + en + '" step="0.01" inputmode="decimal" placeholder="' + ornek + '" value="' + (deger || '') + '"></label>';
  }

  function ciz() {
    var M = masrafToplami(), L_ = M.liste, f = yakit();
    var html = '<div class="rp-kartlar" id="ms-kartlar">' + kartlarHtml() + '</div>';
    if (sonDonem && sonDonem.ozel) html += '<p class="not">' + esc(O.kisaTarih(sonDonem.t0) + ' – ' + O.kisaTarih(sonDonem.t1)) + ' arasında başlayan yolculuklar sayılır. Masraf kayıtlarında saat olmadığından masraflar gün olarak süzülür; saatli aralıkta “GPS km başına” yanıltabilir.</p>';
    var tk = ($('ms-cihaz').value ? [$('ms-cihaz').value] : cihazlar).map(function (c) {
      var t = tuketim(c);
      return t ? '<li><b>' + esc(c) + '</b>: ' + sayi(t.yuz, 1) + ' L/100 km · yakıt ' + tl(t.tlKm) + '/km <small>(' + t.adet + ' alım, ' + sayi(t.yol) + ' gösterge km)</small></li>' : '';
    }).join('');
    html += '<div class="az-bolum"><h4>Yakıt tüketimi</h4>' + (tk ? '<ul>' + tk + '</ul>' : '<p>Hesap için aynı araca, litre ve gösterge km’si girilmiş en az 2 yakıt alımı gerekir.</p>') +
      '<p class="not">Her alımda depoyu tam doldurduğunuz varsayılır; kısmi alımlarda sonuç yanıltır. Seçili dönemden bağımsız, tüm girişler kullanılır.</p></div>';
    html += '<div class="az-bolum"><h4>Masraflar</h4>' + formHtml() + I().tablo(['Tarih', 'Araç', 'Tür', 'Tutar', 'Litre', 'Km', 'Not', ''], L_.map(function (m) {
      return [I().gunYaz(m.tarih), esc(m.cihaz), AD[m.tur] || esc(m.tur), tl(m.tutar), m.litre === null ? '' : sayi(m.litre, 2), m.km === null ? '' : sayi(m.km), '<span class="db-sar">' + esc(m.not) + '</span>',
        '<button type="button" class="az-git" data-is="duzenle" data-id="' + m.id + '">Düzenle</button> <button type="button" class="az-git yr-kirmizi" data-is="sil" data-id="' + m.id + '">Sil</button>'];
    })) + '</div>';
    html += '<div class="az-bolum"><h4>Yolculukların km maliyeti</h4><div class="ms-yakit">' +
      yakitKutusu('ms-fiyat', 'Yakıtın litre fiyatı (TL)', f.fiyat, 10000, 'örn. 72,11') + yakitKutusu('ms-yuz', 'Aracın 100 km’de yaktığı (litre)', f.yuz, 100, 'örn. 8,2') + '</div>' +
      '<div id="ms-sonuc">' + sonucHtml() + '</div>' +
      '<p class="not">Seçili dönem ve araçtaki bütün yolculuklar dahildir. Girilen fiyat ve tüketim tüm araçlara ve dönemlere uygulanır; yalnızca yakıt tahminidir. Mesafe GPS’ten yaklaşık hesaplanır; GPS’siz yol sayılmaz.</p></div>';
    detayKoru($('ms-icerik'), html);
  }

  function yukle() {
    var n = ++no, d = donem();
    mesaj('Yükleniyor…');
    return Rapor.senkron(mesaj).then(function (s) {
      cihazlar = s.cihazlar.slice();
      return Promise.all([O.istek('/emeklirobot/ozellik.php?islem=masraflar&bas=2000-01-01&bit=2100-12-31'), Rapor.veriAl(d.bas, d.bit, $('ms-cihaz').value)]);
    }).then(function (v) {
      if (n !== no) return;
      tumu = v[0].masraflar; veri = v[1];
      sonDonem = d;
      liste = tumu.filter(function (m) { return m.tarih >= d.bas && m.tarih <= d.bit; });
      tumu.forEach(function (m) { if (cihazlar.indexOf(m.cihaz) < 0) cihazlar.push(m.cihaz); });
      cihazlar.sort();
      var secili = $('ms-cihaz').value;
      $('ms-cihaz').innerHTML = '<option value="">Tüm araçlar</option>' + cihazlar.map(function (c) { return '<option' + (c === secili ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      mesaj(''); ciz();
    }).catch(function (e) { if (n === no) { mesaj(O.hataMetni(e)); $('ms-icerik').innerHTML = ''; } });
  }
  function ac() { duzenlenen = null; $('ms-icerik').innerHTML = ''; $('msmodal').hidden = false; yukle(); }
  function islem(ad, govde) {
    mesaj('Kaydediliyor…');
    return O.ozellik(ad, govde).then(function () { duzenlenen = null; return yukle(); }).catch(function (e) { mesaj(e.kod === 'girdi' ? 'Girilen değerleri kontrol edin.' : O.hataMetni(e)); });
  }

  function baslat() {
    O.pencere('msmodal', 'mskapat', function () { no++; });
    $('ms-donem').addEventListener('change', donemDegisti);
    $('ms-bas').addEventListener('change', yukle);
    $('ms-bit').addEventListener('change', yukle);
    $('ms-cihaz').addEventListener('change', yukle);
    $('ms-excel').addEventListener('click', function () {
      I().indir(['Tarih', 'Araç', 'Tür', 'Tutar (TL)', 'Litre', 'Gösterge km', 'Not'], suz(liste).slice().reverse().map(function (m) {
        return [I().gunYaz(m.tarih), m.cihaz, AD[m.tur] || m.tur, m.tutar, m.litre, m.km, m.not];
      }), [12, 16, 14, 12, 8, 12, 40], 'Masraflar', donem());
    });
    $('ms-icerik').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.elements;
      function s(ad) { return f[ad].value === '' ? null : Number(f[ad].value); }
      if (!f.cihaz.value || !f.tarih.value || s('tutar') === null) { mesaj('Araç, tarih ve tutar zorunlu.'); return; }
      islem('masraf_kaydet', { id: duzenlenen ? duzenlenen.id : 0, cihaz: f.cihaz.value, tarih: f.tarih.value, tur: f.tur.value, tutar: s('tutar'), litre: s('litre'), km: s('km') === null ? null : Math.round(s('km')), not: f['not'].value.trim() });
    });
    // Yazdıkça hesaplanır, kutudan çıkınca kaydedilir (iki hane)
    var YAKIT = { 'ms-fiyat': 'yakit_fiyat', 'ms-yuz': 'yakit_100km' };
    function yakitOku(e) {
      var anahtar = YAKIT[e.target.id]; if (!anahtar) return null;
      var v = Math.round(Math.min(Number(e.target.max), Math.max(0, Number(e.target.value) || 0)) * 100) / 100;
      I().ayarlar()[anahtar] = v;
      $('ms-kartlar').innerHTML = kartlarHtml();
      detayKoru($('ms-sonuc'), sonucHtml());
      return { anahtar: anahtar, deger: v };
    }
    $('ms-icerik').addEventListener('input', yakitOku);
    $('ms-icerik').addEventListener('change', function (e) {
      var g = yakitOku(e); if (!g) return;
      mesaj('Kaydediliyor…');
      O.ozellik('ayar_kaydet', g).then(function () { mesaj('Kaydedildi.'); }, function (h) { mesaj(h.kod === 'girdi' ? 'Girilen değerleri kontrol edin.' : O.hataMetni(h)); });
    });
    $('ms-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-is]'); if (!b) return;
      var is = b.getAttribute('data-is'), m = tumu.filter(function (x) { return x.id === Number(b.getAttribute('data-id')); })[0];
      if (is === 'duzenle') { duzenlenen = m; ciz(); $('ms-form').scrollIntoView({ block: 'center' }); }
      else if (is === 'vazgec') { duzenlenen = null; ciz(); }
      else if (is === 'sil') { if (confirm(I().gunYaz(m.tarih) + ' tarihli ' + tl(m.tutar) + ' masraf silinsin mi?')) islem('masraf_sil', { id: m.id }); }
      else if (is === 'dokum') {
        var f = yakit(), iki = function (n) { return Math.round(n * 100) / 100; };
        I().indir(['Başlangıç', 'Bitiş', 'Cihaz', 'Nereden', 'Nereye', 'Mesafe (km)', 'Yakıt (L)', 'Litre fiyatı (TL)', 'Km başı (TL)', 'Tutar (TL)', 'Tür', 'Not'], yollar().map(function (y) {
          var t = I().etkinTur(y), k = y.m / 1000;
          return [new Date(y.t0), new Date(y.t1), y.cihaz, y.nereden ? y.nereden.ad : '', y.nereye ? y.nereye.ad : '', Math.round(k * 10) / 10, iki(k * f.litre), f.fiyat, iki(f.tl), iki(k * f.tl), I().turAdi(t.tur), t.e ? t.e.not : ''];
        }), [20, 20, 16, 24, 24, 12, 10, 16, 13, 12, 8, 30], 'Yolculuk-dokumu', sonDonem);
      }
    });
  }

  window.Masraf = { baslat: baslat, ac: ac };
})();
