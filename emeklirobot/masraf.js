/* Masraf defteri: harcama girişi, toplamlar, km başı maliyet, yakıt tüketimi ve iş yolculuğu km dökümü. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi;
  var AD = { yakit: 'Yakıt', otopark: 'Otopark', kopru: 'Köprü/otoyol', bakim: 'Bakım/onarım', diger: 'Diğer' };
  var liste = [], tumu = [], veri = null, cihazlar = [], duzenlenen = null, no = 0;
  function tl(n) { return sayi(n, 2) + ' TL'; }
  function mesaj(t) { $('ms-mesaj').textContent = t || ''; }
  function I() { return Rapor.ic; }

  function donem() {
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

  function isYollari() { return veri ? veri.yol.filter(function (y) { return I().etkinTur(y).tur === 'is'; }).slice().reverse() : []; }

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

  function ciz() {
    var L_ = suz(liste), toplam = 0, tur = {};
    L_.forEach(function (m) { toplam += m.tutar; tur[m.tur] = (tur[m.tur] || 0) + m.tutar; });
    var gpsKm = veri ? veri.yol.reduce(function (t, y) { return t + y.m; }, 0) / 1000 : 0;
    var html = '<div class="rp-kartlar">' + [['Toplam masraf', tl(toplam), L_.length + ' kayıt'], ['GPS ile yol', sayi(gpsKm, 1) + ' km', 'GPS’siz yol dahil değil'], ['GPS km başına', gpsKm >= 1 && toplam ? tl(toplam / gpsKm) : '—', 'yaklaşık']]
      .concat(Object.keys(tur).map(function (t) { return [AD[t] || t, tl(tur[t]), '']; }))
      .map(function (k) { return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong><small>' + k[2] + '</small></div>'; }).join('') + '</div>';
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
    var Y = isYollari(), isKm = Y.reduce(function (t, y) { return t + y.m; }, 0) / 1000, ucret = I().ayarlar().km_ucreti || 0;
    html += '<div class="az-bolum"><h4>İş yolculuğu km dökümü</h4><p><label>Km ücreti (TL) <input type="number" id="ms-ucret" min="0" max="10000" step="0.1" value="' + ucret + '" inputmode="decimal"></label></p>' +
      '<p><b>' + Y.length + ' iş yolculuğu · ' + sayi(isKm, 1) + ' km' + (ucret ? ' · ' + tl(isKm * ucret) : '') + '</b></p>' +
      (Y.length ? '<p><button type="button" class="az-git" data-is="dokum">İş dökümünü Excel indir</button></p>' : '') +
      '<p class="not">“İş” olarak işaretlenen ya da kuralla İş sayılan yolculuklar. Mesafe GPS’ten yaklaşık hesaplanır.</p></div>';
    $('ms-icerik').innerHTML = html;
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
    $('ms-donem').addEventListener('change', yukle);
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
    $('ms-icerik').addEventListener('change', function (e) {
      if (e.target.id !== 'ms-ucret') return;
      islem('ayar_kaydet', { anahtar: 'km_ucreti', deger: Number(e.target.value) || 0 });
    });
    $('ms-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-is]'); if (!b) return;
      var is = b.getAttribute('data-is'), m = tumu.filter(function (x) { return x.id === Number(b.getAttribute('data-id')); })[0];
      if (is === 'duzenle') { duzenlenen = m; ciz(); $('ms-form').scrollIntoView({ block: 'center' }); }
      else if (is === 'vazgec') { duzenlenen = null; ciz(); }
      else if (is === 'sil') { if (confirm(I().gunYaz(m.tarih) + ' tarihli ' + tl(m.tutar) + ' masraf silinsin mi?')) islem('masraf_sil', { id: m.id }); }
      else if (is === 'dokum') {
        var ucret = I().ayarlar().km_ucreti || 0;
        I().indir(['Başlangıç', 'Bitiş', 'Cihaz', 'Nereden', 'Nereye', 'Mesafe (km)', 'Km ücreti (TL)', 'Tutar (TL)', 'Not'], isYollari().map(function (y) {
          var t = I().etkinTur(y), k = Math.round(y.m / 100) / 10;
          return [new Date(y.t0), new Date(y.t1), y.cihaz, y.nereden ? y.nereden.ad : '', y.nereye ? y.nereye.ad : '', k, ucret, Math.round(k * ucret * 100) / 100, t.e ? t.e.not : ''];
        }), [20, 20, 16, 24, 24, 12, 14, 12, 30], 'Is-yolculuklari', donem());
      }
    });
  }

  window.Masraf = { baslat: baslat, ac: ac };
})();
