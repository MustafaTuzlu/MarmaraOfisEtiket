/* Rapor penceresinin ek sekmeleri (Ziyaretler, Aylık karne, Dikkat çekenler, Cihaz sağlığı),
   otomatik İş/Özel kuralları ve "Günün hikâyesi". Kaynak: günlük özetler (rapor.js). */
(function () {
  'use strict';
  var O = window.Ortak, esc = O.esc, sayi = O.sayi, saat = O.saat, sure = O.sure, km = O.km;
  var R = window.Rapor, I = R.ic;
  var BIRLESTIR = 2 * 3600e3, YAKIN_YOL = 10 * 60e3;
  var AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function kartlar(L_) { return '<div class="rp-kartlar">' + L_.map(function (k) { return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong>' + (k[2] ? '<small>' + k[2] + '</small>' : '') + '</div>'; }).join('') + '</div>'; }
  function bolum(b, ic) { return '<div class="az-bolum"><h4>' + b + '</h4>' + ic + '</div>'; }
  function saatDk(ms) { var d = Math.round(ms / 60e3); return ('0' + Math.floor(d / 60) % 24).slice(-2) + ':' + ('0' + d % 60).slice(-2); }

  /* ---------- Ziyaretler ---------- */
  // Aynı yerdeki ardışık duraklar tek ziyarettir (gece yarısında bölünen ya da GPS'siz devam eden bekleme dahil).
  // Arada o yerden ayrılan bir yolculuk varsa ya da boşluk 2 saati aşıyorsa yeni ziyaret sayılır.
  function ziyaretler(veri) {
    var yolCihaz = {};
    veri.tumYol.forEach(function (y) { (yolCihaz[y.cihaz] = yolCihaz[y.cihaz] || []).push(y); });
    function yolVar(c, t0, t1, enAz) { return (yolCihaz[c] || []).some(function (y) { return y.m >= enAz && y.t0 >= t0 - 60e3 && y.t0 <= t1; }); }
    var D = veri.tumDurak.filter(function (x) { return x.yer; }).sort(function (a, b) { return a.cihaz < b.cihaz ? -1 : a.cihaz > b.cihaz ? 1 : a.t0 - b.t0; });
    var Z = [], son = null;
    D.forEach(function (d) {
      var a = d.yer.kayitli ? 'y' + d.yer.yerId : d.yer.anahtar; // bir yerin tüm konumları (bina, otopark) aynı ziyaret grubudur
      if (son && son.cihaz === d.cihaz && son.anahtar === a && d.t0 - son.t1 <= BIRLESTIR && !yolVar(d.cihaz, son.t1, d.t0, 300)) {
        son.t1 = Math.max(son.t1, d.t1); son.sure += d.t1 - d.t0; if (d.belirsiz) son.belirsiz += d.t1 - d.t0;
        return;
      }
      son = { cihaz: d.cihaz, anahtar: a, yer: d.yer, ad: d.yer.kayitli ? d.yer.yerAd : d.yer.ad, t0: d.t0, t1: d.t1, sure: d.t1 - d.t0, belirsiz: d.belirsiz ? d.t1 - d.t0 : 0 };
      Z.push(son);
    });
    Z.forEach(function (z) {
      var Y = yolCihaz[z.cihaz] || [];
      z.varisBelli = Y.some(function (y) { return y.t1 <= z.t0 + 60e3 && z.t0 - y.t1 <= YAKIN_YOL; });
      z.cikisBelli = Y.some(function (y) { return y.t0 >= z.t1 - 60e3 && y.t0 - z.t1 <= YAKIN_YOL; });
    });
    var bas = O.gunBasi(veri.d.bas), bit = O.gunBasi(veri.d.bit) + 864e5;
    return Z.filter(function (z) { return z.t1 > bas && z.t0 < bit; });
  }

  var secilenYer = '', enAzDk = 5;
  function ziyaretListesi(veri) { return ziyaretler(veri).filter(function (z) { return z.t1 - z.t0 >= enAzDk * 60e3; }); }
  function yerGruplari(Z) {
    var G = {};
    Z.forEach(function (z) { var g = G[z.anahtar] = G[z.anahtar] || { anahtar: z.anahtar, ad: z.ad, yer: z.yer, kayitli: !!z.yer.kayitli, sure: 0, adet: 0 }; g.sure += z.t1 - z.t0; g.adet++; });
    return Object.keys(G).map(function (a) { return G[a]; }).sort(function (a, b) { return (b.kayitli - a.kayitli) || (b.sure - a.sure); });
  }
  function ziyaretCiz(veri) {
    var Z = ziyaretListesi(veri), G = yerGruplari(Z);
    if (!G.length) return '<p class="not">Bu dönemde bu süreyi aşan ziyaret yok.</p>' + sureSecici();
    if (!G.some(function (g) { return g.anahtar === secilenYer; })) secilenYer = G[0].anahtar;
    var g = G.filter(function (x) { return x.anahtar === secilenYer; })[0];
    var S = Z.filter(function (z) { return z.anahtar === secilenYer; }).sort(function (a, b) { return b.t0 - a.t0; });
    var gunler = {}, aylar = {};
    S.forEach(function (z) { gunler[O.istGun(z.t0)] = 1; var a = O.istGun(z.t0).slice(0, 7); aylar[a] = aylar[a] || { n: 0, s: 0, g: {} }; aylar[a].n++; aylar[a].s += z.t1 - z.t0; aylar[a].g[O.istGun(z.t0)] = 1; });
    var varislar = S.filter(function (z) { return z.varisBelli; }).map(function (z) { return z.t0 - O.gunBasi(O.istGun(z.t0)); });
    var toplam = S.reduce(function (t, z) { return t + z.t1 - z.t0; }, 0);
    return '<div class="rp-suzgec"><label>Yer <select id="zy-yer">' + G.map(function (x) { return '<option value="' + esc(x.anahtar) + '"' + (x.anahtar === secilenYer ? ' selected' : '') + '>' + esc(x.ad) + ' (' + x.adet + ')</option>'; }).join('') + '</select></label>' + sureSecici() +
      (g.kayitli ? '' : '<p>' + I.ucHtml(g.yer) + ' <small>— ad vermek için tıklayın</small></p>') + '</div>' +
      kartlar([['Ziyaret', sayi(S.length), Object.keys(gunler).length + ' farklı gün'], ['Toplam süre', sure(toplam), 'ziyaret başına ' + sure(toplam / S.length)],
        ['Tipik varış saati', varislar.length ? saatDk(I.ortanca(varislar)) : '—', varislar.length ? varislar.length + ' varış üzerinden' : 'varışı bilinen ziyaret yok'], ['Son ziyaret', O.kisaTarih(S[0].t0), '']]) +
      bolum('Aylara göre', I.tablo(['Ay', 'Ziyaret', 'Gün', 'Toplam süre'], Object.keys(aylar).sort().reverse().map(function (a) { return [AY_ADI[Number(a.slice(5)) - 1] + ' ' + a.slice(0, 4), aylar[a].n, Object.keys(aylar[a].g).length, sure(aylar[a].s)]; }))) +
      bolum('Ziyaretler', I.tablo(['Varış', 'Ayrılış', 'Süre', 'Cihaz', 'Not', ''], S.slice(0, 200).map(function (z) {
        return [(z.varisBelli ? '' : '≤ ') + O.kisaTarih(z.t0), (z.cikisBelli ? '' : '≥ ') + O.kisaTarih(z.t1), sure(z.t1 - z.t0), esc(z.cihaz), z.belirsiz ? 'GPS’siz ' + sure(z.belirsiz) : '',
          '<button type="button" class="az-git rp-hikaye" data-gun="' + O.istGun(z.t0) + '">Günü göster</button>'];
      })) + (S.length > 200 ? '<p class="not">İlk 200 ziyaret gösteriliyor; Excel tümünü içerir.</p>' : '') +
        '<p class="not">“≤ / ≥” işareti: varış ya da ayrılış anı kayıtlardan kesin bilinmiyor. Süre, telefonun bulunduğu aracın o konumda kaldığı süredir.</p>');
  }
  function sureSecici() { return '<label>En az süre <select id="zy-sure">' + [1, 5, 15, 30, 60].map(function (d) { return '<option value="' + d + '"' + (d === enAzDk ? ' selected' : '') + '>' + d + ' dk</option>'; }).join('') + '</select></label>'; }
  R.sekmeEkle('ziyaret', {
    ciz: ziyaretCiz,
    degisim: function (e) { if (e.target.id === 'zy-yer') secilenYer = e.target.value; else if (e.target.id === 'zy-sure') enAzDk = Number(e.target.value); else return; I.ciz(); },
    excel: function (veri) {
      var S = ziyaretListesi(veri).filter(function (z) { return z.anahtar === secilenYer; }).sort(function (a, b) { return a.t0 - b.t0; });
      I.indir(['Yer', 'Varış', 'Ayrılış', 'Süre (dk)', 'GPS’siz (dk)', 'Cihaz', 'Varış kesin', 'Ayrılış kesin'], S.map(function (z) {
        return [z.ad, new Date(z.t0), new Date(z.t1), Math.round((z.t1 - z.t0) / 60e3), Math.round(z.belirsiz / 60e3), z.cihaz, z.varisBelli ? 'Evet' : 'Hayır', z.cikisBelli ? 'Evet' : 'Hayır'];
      }), [24, 20, 20, 10, 12, 16, 12, 12], 'Ziyaretler');
    }
  });

  /* ---------- Aylık araç karnesi ---------- */
  var MASRAF_AD = { yakit: 'Yakıt', otopark: 'Otopark', kopru: 'Köprü/otoyol', bakim: 'Bakım/onarım', diger: 'Diğer' };
  var karneNo = 0;
  function karneCiz(veri) {
    var d = veri.d, ay = AY_ADI[Number(d.bas.slice(5, 7)) - 1] + ' ' + d.bas.slice(0, 4);
    var cihazlar = [];
    veri.gunler.forEach(function (g) { if (cihazlar.indexOf(g.cihaz) < 0) cihazlar.push(g.cihaz); });
    if (!cihazlar.length) return '<p class="not">' + ay + ' için veri yok.</p>';
    var Z = ziyaretler(veri);
    return cihazlar.sort().map(function (c) {
      var G = veri.gunler.filter(function (g) { return g.cihaz === c; }), t = I.topla(G);
      var tur = { is: 0, ozel: 0, '': 0 };
      veri.yol.filter(function (y) { return y.cihaz === c; }).forEach(function (y) { tur[I.etkinTur(y).tur] += y.m; });
      var gunKm = {};
      G.forEach(function (g) { gunKm[g.gun] = g.veri.m; });
      var seri = [], g;
      for (g = d.bas; g <= d.bit; g = O.gunEkle(g, 1)) seri.push({ k: String(Number(g.slice(8))), tam: I.gunYaz(g), d: gunKm[g] || 0 });
      var yerler = yerGruplari(Z.filter(function (z) { return z.cihaz === c && z.t1 - z.t0 >= 5 * 60e3; })).sort(function (a, b) { return b.sure - a.sure; }).slice(0, 5);
      return '<section class="kr-sayfa" data-cihaz="' + esc(c) + '"><h3 class="kr-baslik">Aylık araç karnesi · ' + esc(c) + ' · ' + ay + (d.bit > O.istGun(Date.now()) ? ' (ay sürüyor)' : '') + '</h3>' +
        kartlar([['Toplam yol', km(t.m)], ['Sürüş', sure(t.surus * 1000)], ['Yolculuk', sayi(t.yol)], ['Hareketli gün', t.aktif + ' gün'], ['En yüksek hız', t.maks === null ? '—' : sayi(t.maks) + ' km/sa'], ['İş / Özel / Etiketsiz', km(tur.is) + ' / ' + km(tur.ozel) + ' / ' + km(tur[''])]]) +
        I.sutunlar('Günlük yol', seri, km, true) +
        bolum('En çok zaman geçirilen 5 yer', I.tablo(['Yer', 'Ziyaret', 'Süre'], yerler.map(function (y) { return [esc(y.ad), y.adet, sure(y.sure)]; }))) +
        bolum('Masraflar', '<div class="kr-masraf" data-km="' + t.m + '"><p class="sayac">Yükleniyor…</p></div>') +
        bolum('Bakım durumu', '<div class="kr-bakim"><p class="sayac">Yükleniyor…</p></div>') +
        '<p class="not">Mesafe GPS’ten hesaplanır' + (t.gps ? '; GPS alınamayan ' + sure(t.gps * 1000) + ' içindeki yol dahil değildir.' : '.') + '</p></section>';
    }).join('');
  }
  function karneSonra(veri) {
    var n = ++karneNo;
    function her(secici, f) { [].forEach.call(document.querySelectorAll('.kr-sayfa'), function (s) { var k = s.querySelector(secici); if (k) k.innerHTML = f(s.getAttribute('data-cihaz'), k); }); }
    O.istek('/emeklirobot/ozellik.php?islem=masraflar&bas=' + veri.d.bas + '&bit=' + veri.d.bit).then(function (v) {
      if (n !== karneNo) return;
      her('.kr-masraf', function (c, kutu) {
        var tur = {}, toplam = 0;
        v.masraflar.filter(function (m) { return m.cihaz === c; }).forEach(function (m) { tur[m.tur] = (tur[m.tur] || 0) + m.tutar; toplam += m.tutar; });
        if (!toplam) return '<p>Bu ay masraf girilmemiş.</p>';
        var kmSayisi = Number(kutu.getAttribute('data-km')) / 1000;
        return I.tablo(['Tür', 'Tutar'], Object.keys(tur).map(function (a) { return [MASRAF_AD[a] || esc(a), sayi(tur[a], 2) + ' TL']; }).concat([['<b>Toplam</b>', '<b>' + sayi(toplam, 2) + ' TL</b>']])) +
          (kmSayisi >= 1 ? '<p>GPS km’si başına yaklaşık ' + sayi(toplam / kmSayisi, 2) + ' TL.</p>' : '');
      });
    }, function (e) { if (n === karneNo) her('.kr-masraf', function () { return '<p>' + esc(O.hataMetni(e)) + '</p>'; }); });
    Bakim.durumlar().then(function (D) {
      if (n !== karneNo) return;
      her('.kr-bakim', function (c) {
        var L_ = D.filter(function (x) { return x.cihaz === c; });
        return L_.length ? '<ul>' + L_.map(function (x) { return '<li><b>' + esc(x.ad) + '</b>: ' + esc(x.metin) + '</li>'; }).join('') + '</ul><p class="not">Bakım durumu bugüne göredir.</p>' : '<p>Bakım maddesi yok.</p>';
      });
    }, function (e) { if (n === karneNo) her('.kr-bakim', function () { return '<p>' + esc(O.hataMetni(e)) + '</p>'; }); });
  }
  R.sekmeEkle('karne', { ciz: karneCiz, sonra: karneSonra });

  /* ---------- Dikkat çeken hareketler (yalnızca panelde gösterilir; bildirim yok) ---------- */
  function ayar(ad, vars) { var v = I.ayarlar()[ad]; return v === undefined ? vars : v; }
  function hizSiniri() { try { var h = Number(localStorage.getItem('er_hiz_sinir')); if (h >= 10 && h <= 300) return h; } catch (e) {} return 90; }
  // gecmis: en az dönem öncesini de içeren hazır veri (ilk kez görülen konum için karşılaştırma tabanı)
  function dikkatHesapla(gecmis, bas, bit) {
    var geceBas = ayar('gece_bas', 0), geceBit = ayar('gece_bit', 5), uzak = ayar('uzak_km', 20) * 1000, hiz = hizSiniri();
    function geceMi(y) {
      if (geceBas === geceBit) return false;
      for (var t = y.t0; t <= y.t1; t += 5 * 60e3) {
        var s = Math.floor(((t + 3 * 3600e3) % 864e5) / 3600e3);
        if (geceBas < geceBit ? (s >= geceBas && s < geceBit) : (s >= geceBas || s < geceBit)) return true;
      }
      return false;
    }
    var yerler = [];
    Yerler.liste().forEach(function (y) { yerler = yerler.concat(y.noktalar); });
    var Y = gecmis.tumYol.slice().sort(function (a, b) { return a.t0 - b.t0; }), bilinen = [], ilk = Y.length ? Y[0].t0 : 0, S = [];
    Y.forEach(function (y) {
      var secili = y.gun >= bas && y.gun <= bit, neden = [];
      if (secili && y.m >= 200 && geceMi(y)) neden.push(['gece', 'Gece sürüşü']);
      if (secili && y.maks !== null && y.maks > hiz) neden.push(['hiz', 'Hız sınırı (' + hiz + ') aşıldı: ' + sayi(y.maks) + ' km/sa']);
      var v = y.nereye;
      if (v) {
        // İlk kez görülen uzak konum: en az 14 günlük geçmiş varsa; kayıtlı yerlerden ve daha önce gidilen her noktadan uzaksa
        if (secili && y.t0 - ilk >= 14 * 864e5) {
          var yakin = yerler.concat(bilinen).reduce(function (m, p) { return Math.min(m, Analiz.mesafe(p, v)); }, Infinity);
          if (yakin > uzak && yakin < Infinity) neden.push(['uzak', 'İlk kez görülen uzak konum (bilinen en yakın yere ' + km(yakin) + ')']);
        }
        bilinen.push({ lat: v.lat, lon: v.lon });
      }
      if (y.nereden) bilinen.push({ lat: y.nereden.lat, lon: y.nereden.lon });
      if (neden.length) S.push({ y: y, neden: neden });
    });
    return { liste: S.reverse(), gecmisKisa: !Y.length || Y[Y.length - 1].t0 - ilk < 14 * 864e5 };
  }
  var dikkatGecmis = null, dikkatAnahtar = '', dikkatNo = 0;
  function dikkatCiz(veri) {
    return '<details class="rp-kurallar"><summary>Ölçütler</summary><div class="rp-suzgec">' +
      '<label>Gece başlangıcı (saat) <input type="number" class="dk-ayar" data-ayar="gece_bas" min="0" max="23" value="' + ayar('gece_bas', 0) + '"></label>' +
      '<label>Gece bitişi (saat) <input type="number" class="dk-ayar" data-ayar="gece_bit" min="0" max="23" value="' + ayar('gece_bit', 5) + '"></label>' +
      '<label>Uzak konum eşiği (km) <input type="number" class="dk-ayar" data-ayar="uzak_km" min="1" max="2000" value="' + ayar('uzak_km', 20) + '"></label></div>' +
      '<p class="not">Hız eşiği “Analiz” penceresindeki hız sınırıdır (' + hizSiniri() + ' km/sa). Gece başlangıcı ile bitişi aynıysa gece ölçütü kapanır.</p></details>' +
      '<div id="dk-liste"><p class="sayac">İnceleniyor…</p></div>';
  }
  function dikkatSonra(veri) {
    var n = ++dikkatNo, d = veri.d, anahtar = d.bas + d.bit + veri.cihaz;
    // Karşılaştırma tabanı: dönemin bir yıl öncesinden itibaren
    R.veriAl(O.gunEkle(d.bas, -365), d.bit, veri.cihaz).then(function (g) {
      var kutu = document.getElementById('dk-liste');
      if (n !== dikkatNo || !kutu) return;
      dikkatGecmis = dikkatHesapla(g, d.bas, d.bit); dikkatAnahtar = anahtar;
      var AD = { gece: '🌙', hiz: '⚡', uzak: '🧭' };
      kutu.innerHTML = (dikkatGecmis.liste.length ? '<ul class="dk-liste">' + dikkatGecmis.liste.slice(0, 150).map(function (x) {
        var y = x.y;
        return '<li><div><b>' + O.kisaTarih(y.t0) + '</b> · ' + esc(y.cihaz) + '<br>' + esc((y.nereden ? y.nereden.ad : '?') + ' → ' + (y.nereye ? y.nereye.ad : '?')) + ' · ' + sure(y.t1 - y.t0) + ' · ' + km(y.m) + '</div><div>' +
          x.neden.map(function (z) { return '<span class="az-cip uy">' + AD[z[0]] + ' ' + esc(z[1]) + '</span>'; }).join(' ') + ' <button type="button" class="az-git rp-hikaye" data-gun="' + y.gun + '">Günü göster</button></div></li>';
      }).join('') + '</ul>' : '<p class="not">Bu dönemde ölçütlere uyan hareket yok.</p>') +
        (dikkatGecmis.gecmisKisa ? '<p class="not">“İlk kez görülen uzak konum” için en az 14 günlük geçmiş gerekir; henüz yeterli veri yok.</p>' : '') +
        '<p class="not">Kayıtlar sunucuya gecikmeli ulaşabildiği için bu liste hırsızlık alarmı değildir. Bildirim gönderilmez.</p>';
    }).catch(function (e) { var k = document.getElementById('dk-liste'); if (n === dikkatNo && k) k.innerHTML = '<p class="az-uyari">' + esc(O.hataMetni(e)) + '</p>'; });
  }
  R.sekmeEkle('dikkat', {
    ciz: dikkatCiz, sonra: dikkatSonra,
    degisim: function (e) {
      if (!e.target.classList.contains('dk-ayar')) return;
      var v = Number(e.target.value);
      O.ozellik('ayar_kaydet', { anahtar: e.target.getAttribute('data-ayar'), deger: v }).then(function () { return I.ekVerileriGetir(); })
        .then(function () { I.ciz(); I.mesaj('Ölçüt kaydedildi.'); }).catch(function (err) { I.mesaj(err.kod === 'girdi' ? 'Geçersiz değer.' : O.hataMetni(err)); });
    },
    excel: function (veri) {
      if (!dikkatGecmis || dikkatAnahtar !== veri.d.bas + veri.d.bit + veri.cihaz) return;
      I.indir(['Zaman', 'Cihaz', 'Nereden', 'Nereye', 'Mesafe (km)', 'Neden'], dikkatGecmis.liste.map(function (x) {
        var y = x.y; return [new Date(y.t0), y.cihaz, y.nereden ? y.nereden.ad : '', y.nereye ? y.nereye.ad : '', Math.round(y.m / 100) / 10, x.neden.map(function (z) { return z[1]; }).join('; ')];
      }), [20, 16, 24, 24, 12, 60], 'Dikkat');
    }
  });
  // Son durum kartı uyarısı: dün ve bugün
  function sonUyarilar() {
    var bugun = O.istGun(Date.now()), dun = O.gunEkle(bugun, -1);
    return R.veriAl(O.gunEkle(bugun, -365), bugun, '').then(function (g) {
      var u = {};
      dikkatHesapla(g, dun, bugun).liste.forEach(function (x) { u[x.y.cihaz] = (u[x.y.cihaz] || 0) + 1; });
      return u;
    });
  }

  /* ---------- Cihaz sağlığı ---------- */
  function saglikTopla(G) {
    var t = { gun: 0, adet: 0, gec: [], gecM: 0, konumYok: 0, gps: 0, yok: 0, isinma: 0, kritik: 0, sic: null, sessiz: 0, dusus: 0, eksik: 0 };
    G.forEach(function (g) {
      var s = g.veri.sag;
      t.gps += g.veri.gps; t.yok += g.veri.yok;
      if (!s) { t.eksik++; return; }
      t.gun++; t.adet += s.adet; if (s.gecO !== null) t.gec.push(s.gecO); t.gecM = Math.max(t.gecM, s.gecM); t.konumYok += s.konumYok;
      t.isinma += s.isinma; t.kritik += s.kritik; t.sessiz = Math.max(t.sessiz, s.sessiz); t.dusus += s.sarjDusus;
      if (s.sicM !== null && (t.sic === null || s.sicM > t.sic)) t.sic = s.sicM;
    });
    t.gecO = t.gec.length ? I.ortanca(t.gec) : null;
    return t;
  }
  function hafta(gun) { return O.gunEkle(gun, -((new Date(gun + 'T12:00:00Z').getUTCDay() + 6) % 7)); }
  function saglikCiz(veri) {
    if (!veri.gunler.length) return '<p class="not">Bu dönemde veri yok.</p>';
    var cihazlar = {};
    veri.gunler.forEach(function (g) { (cihazlar[g.cihaz] = cihazlar[g.cihaz] || []).push(g); });
    return Object.keys(cihazlar).sort().map(function (c) {
      var G = cihazlar[c], t = saglikTopla(G), uyari = [];
      var sonGun = veri.tumGunler.filter(function (g) { return g.cihaz === c; }).reduce(function (m, g) { return g.gun > m ? g.gun : m; }, '');
      if (veri.d.bit >= O.istGun(Date.now()) && sonGun < O.gunEkle(O.istGun(Date.now()), -1)) uyari.push('Dünden beri kayıt yok (son kayıtlı gün ' + I.gunYaz(sonGun) + ').');
      if (t.gecO !== null && t.gecO > 1800) uyari.push('Kayıtlar tipik olarak ' + sure(t.gecO * 1000) + ' gecikmeyle ulaşıyor: telefonun internet bağlantısını kontrol edin.');
      if (t.kritik) uyari.push(t.kritik + ' kritik ısınma kaydı: telefonu güneşten uzak tutun.');
      else if (t.isinma) uyari.push(t.isinma + ' ısınma kaydı var.');
      if (t.dusus) uyari.push(t.dusus + ' günde şarjdayken pil düştü: şarj kablosu/adaptörü yetersiz olabilir.');
      if (t.sessiz > 12 * 3600) uyari.push('En uzun kayıtsız süre ' + sure(t.sessiz * 1000) + '.');
      var H = {};
      G.forEach(function (g) { (H[hafta(g.gun)] = H[hafta(g.gun)] || []).push(g); });
      return '<section class="sg-cihaz"><h3 class="kr-baslik">' + esc(c) + '</h3>' +
        (uyari.length ? '<ul class="db-saglik">' + uyari.map(function (u) { return '<li class="uy"><span>' + esc(u) + '</span></li>'; }).join('') + '</ul>' : '<ul class="db-saglik"><li class="ok"><span>Bu dönemde belirgin bir sorun görünmüyor.</span></li></ul>') +
        kartlar([['Gönderim gecikmesi (tipik)', t.gecO === null ? '—' : sure(t.gecO * 1000), 'en uzun ' + sure(t.gecM * 1000)], ['GPS alınamadı kaydı', sayi(t.konumYok), 'GPS’siz toplam ' + sure(t.gps * 1000)],
          ['Kayıtsız süre', sure(t.yok * 1000), 'en uzun ' + sure(t.sessiz * 1000)], ['Isınma', sayi(t.isinma) + ' / ' + sayi(t.kritik) + ' kritik', t.sic === null ? '' : 'en yüksek ' + sayi(t.sic, 1) + ' °C'], ['Log', sayi(t.adet), t.gun + ' gün']]) +
        bolum('Haftalık değişim', I.tablo(['Hafta', 'Gün', 'Log', 'Tipik gecikme', 'GPS alınamadı', 'GPS’siz süre', 'Kayıtsız süre', 'Isınma', 'En yüksek °C'], Object.keys(H).sort().reverse().map(function (h) {
          var x = saglikTopla(H[h]);
          return [I.gunYaz(h), H[h].length, sayi(x.adet), x.gecO === null ? '—' : sure(x.gecO * 1000), x.konumYok, sure(x.gps * 1000), sure(x.yok * 1000), x.isinma + x.kritik, x.sic === null ? '—' : sayi(x.sic, 1)];
        }))) + (t.eksik ? '<p class="not">' + t.eksik + ' günün sağlık ayrıntısı yok (ham logları silinmeden önce eski sürümle özetlenmiş).</p>' : '') + '</section>';
    }).join('');
  }
  R.sekmeEkle('saglik', {
    ciz: saglikCiz,
    excel: function (veri) {
      I.indir(['Gün', 'Cihaz', 'Log', 'Tipik gecikme (sn)', 'En uzun gecikme (sn)', 'GPS alınamadı', 'GPS’siz (dk)', 'Kayıtsız (dk)', 'Isınma', 'Kritik', 'En yüksek °C', 'En düşük pil'], veri.gunler.map(function (g) {
        var s = g.veri.sag || {};
        return [I.gunYaz(g.gun), g.cihaz, s.adet, s.gecO, s.gecM, s.konumYok, Math.round(g.veri.gps / 60), Math.round(g.veri.yok / 60), s.isinma, s.kritik, s.sicM, s.pilMin];
      }), [12, 16, 8, 18, 18, 14, 13, 13, 8, 8, 12, 12], 'Cihaz-sagligi');
    }
  });

  /* ---------- Otomatik İş/Özel kuralları (Yolculuklar sekmesinin üstünde) ---------- */
  var kuralAcik = false;
  function ucAdi(k) {
    if (k === '*') return 'Her yer';
    if (k.indexOf('tur:') === 0) return { ev: 'Herhangi bir ev', is: 'Herhangi bir iş yeri', diger: 'Herhangi bir “diğer” yer' }[k.slice(4)];
    var y = Yerler.liste().filter(function (x) { return 'yer:' + x.id === k; })[0];
    return y ? y.ad : 'Silinmiş yer';
  }
  function secenekler(vars) {
    return ['tur:ev', 'tur:is', 'tur:diger'].concat(Yerler.liste().map(function (y) { return 'yer:' + y.id; }), ['*']).map(function (k) {
      return '<option value="' + k + '"' + (k === vars ? ' selected' : '') + '>' + esc(ucAdi(k)) + '</option>';
    }).join('');
  }
  function kuralHtml() {
    var K = I.kurallar();
    return '<details class="rp-kurallar"' + (kuralAcik ? ' open' : '') + '><summary>Otomatik İş/Özel kuralları (' + K.length + ')</summary>' +
      (K.length ? '<ul>' + K.map(function (k) {
        return '<li><span><b>' + esc(ucAdi(k.kaynak)) + '</b> ' + (k.ikiYon ? '↔' : '→') + ' <b>' + esc(ucAdi(k.hedef)) + '</b> → ' + I.turAdi(k.tur) + '</span><button type="button" class="az-git yr-kirmizi" data-kural-sil="' + k.id + '">Sil</button></li>';
      }).join('') + '</ul>' : '<p class="not">Kural yok. Örnek: Herhangi bir ev ↔ Herhangi bir iş yeri → İş.</p>') +
      '<div class="rp-suzgec kural-form"><label>Nereden <select id="kr-kaynak">' + secenekler('tur:ev') + '</select></label><label>Nereye <select id="kr-hedef">' + secenekler('tur:is') + '</select></label>' +
      '<label>Say <select id="kr-tur"><option value="is">İş</option><option value="ozel">Özel</option></select></label><label class="kr-yon"><input type="checkbox" id="kr-iki" checked> Dönüş de</label>' +
      '<button type="button" class="az-git" id="kr-ekle">Kural ekle</button></div>' +
      '<p class="not">Kurallar yalnızca kayıtlı yerler arasında çalışır ve geçmiş yolculuklara da uygulanır. Yolculukta elle seçtiğiniz tür kuraldan üstündür; “Hiçbiri” kuralı o yolculuk için kapatır. Birden çok kural uyarsa belirli yer, yer türünden üstündür.</p></details>';
  }
  function kuralIslem(islem, govde) {
    kuralAcik = true;
    O.ozellik(islem, govde).then(function () { return I.ekVerileriGetir(); }).then(function () { I.ciz(); I.mesaj('Kurallar güncellendi.'); })
      .catch(function (e) { I.mesaj(O.hataMetni(e)); });
  }
  function tik(e) {
    var sil = e.target.closest('[data-kural-sil]');
    if (korTik(e)) return true;
    if (sil) { if (confirm('Bu kural silinsin mi?')) kuralIslem('kural_sil', { id: Number(sil.getAttribute('data-kural-sil')) }); return true; }
    if (e.target.closest('#kr-ekle')) {
      var g = { kaynak: document.getElementById('kr-kaynak').value, hedef: document.getElementById('kr-hedef').value, tur: document.getElementById('kr-tur').value, ikiYon: document.getElementById('kr-iki').checked };
      if (g.kaynak === '*' && g.hedef === '*') { I.mesaj('İki uç birden “Her yer” olamaz.'); return true; }
      kuralIslem('kural_kaydet', g);
      return true;
    }
    return false;
  }

  /* ---------- GPS kör noktaları ---------- */
  var AYNI_YER = 150; // sinyal kesildiği yere bu kadar yakında dönerse "aynı yerde"
  var korListe = [];
  function korGruplari(veri) {
    var G = {};
    veri.kayip.forEach(function (k) {
      var a = k.yer.kayitli ? 'y' + k.yer.yerId : k.yer.anahtar;
      var g = G[a] = G[a] || { yer: k.yer, ad: k.yer.kayitli ? k.yer.yerAd : k.yer.ad, olay: [], sure: 0, ayni: 0, uzak: [], bilinmeyen: 0, gun: {} };
      g.olay.push(k); g.sure += k.t1 - k.t0; g.gun[O.istGun(k.t0)] = 1;
      if (k.fark === null) g.bilinmeyen++; else if (k.fark <= AYNI_YER) g.ayni++; else g.uzak.push(k.fark);
    });
    return Object.keys(G).map(function (a) { return G[a]; }).sort(function (a, b) { return (b.olay.length - a.olay.length) || (b.sure - a.sure); });
  }
  function korDavranis(g) {
    var P = [];
    if (g.ayni) P.push(g.ayni + ' kez aynı yerde geri geldi');
    if (g.uzak.length) P.push(g.uzak.length + ' kez başka yerde (tipik ' + O.metre(I.ortanca(g.uzak)) + ' ötede)');
    if (g.bilinmeyen) P.push(g.bilinmeyen + ' kez dönüş yeri bilinmiyor');
    return P.join(' · ');
  }
  function korNokta(g, no) {
    var k = g.olay[g.olay.length - 1];
    return { no: no, konum: [k.lat, k.lon], etiket: g.ad + ': ' + g.olay.length + ' kez, toplam ' + sure(g.sure) };
  }
  function korCiz(veri) {
    korListe = korGruplari(veri);
    var eksik = veri.gunler.filter(function (g) { return g.veri.gps > 0 && !g.veri.gpsy; }).length;
    var uyari = eksik ? '<p class="az-uyari">GPS’siz süre içeren ' + eksik + ' cihaz-gün için konum bilgisi yok (ham kayıtları silinmiş eski özetler); bu listeye girmez.</p>' : '';
    if (!korListe.length) return uyari + '<p class="not">Bu dönemde kayda geçen bir GPS kaybı yok.</p>';
    var toplam = veri.kayip.reduce(function (t, k) { return t + k.t1 - k.t0; }, 0);
    return uyari + kartlar([['GPS kaybı', sayi(veri.kayip.length) + ' kez', ''], ['Toplam süre', sure(toplam), 'tipik ' + sure(I.ortanca(veri.kayip.map(function (k) { return k.t1 - k.t0; })))], ['Farklı nokta', sayi(korListe.length), '']]) +
      '<p><button type="button" class="analiz-btn" data-kor="hepsi">Haritada göster' + (korListe.length > 40 ? ' (en sık 40)' : '') + '</button></p>' +
      bolum('Sinyalin kesildiği yerler', I.tablo(['No', 'Yer', 'Kez', 'Gün', 'Toplam süre', 'Nasıl geri geldi', 'Son', ''], korListe.slice(0, 100).map(function (g, i) {
        var son = g.olay.reduce(function (m, k) { return k.t0 > m.t0 ? k : m; }, g.olay[0]);
        return [i + 1, I.ucHtml(g.yer), g.olay.length, Object.keys(g.gun).length, sure(g.sure), '<span class="db-sar">' + esc(korDavranis(g)) + '</span>', O.kisaTarih(son.t0),
          '<button type="button" class="az-git" data-kor="' + i + '">Haritada</button>'];
      }))) +
      '<p class="not">İşaret, sinyal kesilmeden önceki son bilinen konumdur; sinyalin kaybolduğu tam yer biraz ileride olabilir. “Aynı yerde geri geldi” (' + AYNI_YER + ' m içinde) çoğunlukla kapalı otopark ya da bina içini, “başka yerde” sinyal yokken yer değiştirildiğini düşündürür; kesin neden kayıtlardan bilinemez.</p>';
  }
  function korTik(e) {
    var b = e.target.closest('button[data-kor]'); if (!b) return false;
    var a = b.getAttribute('data-kor'), L_ = a === 'hepsi' ? korListe.slice(0, 40).map(function (g, i) { return korNokta(g, i + 1); }) : [korNokta(korListe[Number(a)], Number(a) + 1)];
    O.haritadaGoster({ etiket: a === 'hepsi' ? 'GPS kör noktaları (' + L_.length + ')' : L_[0].etiket, duraklar: L_, daginik: L_.map(function (x) { return x.konum; }) });
    return true;
  }
  R.sekmeEkle('kor', {
    ciz: korCiz,
    excel: function (veri) {
      I.indir(['Başlangıç', 'Bitiş', 'Süre (dk)', 'Cihaz', 'Yer', 'Enlem', 'Boylam', 'Dönüşte uzaklık (m)'], veri.kayip.slice().sort(function (a, b) { return a.t0 - b.t0; }).map(function (k) {
        return [new Date(k.t0), new Date(k.t1), Math.round((k.t1 - k.t0) / 60e3), k.cihaz, k.yer.ad, k.lat, k.lon, k.fark];
      }), [20, 20, 10, 16, 24, 12, 12, 20], 'GPS-kor-noktalari');
    }
  });

  /* ---------- Günün hikâyesi ---------- */
  function hikayeOynat(cihaz, gun, yaz) {
    var bas = O.gunBasi(gun), mesaj = yaz || I.mesaj;
    mesaj('Günün kayıtları alınıyor…');
    Yerler.hazir().then(function () { return O.veriGetir(O.aralikSorgu(bas - 864e5, bas + 2 * 864e5 - 1000, cihaz)); })
      .then(function (r) { return r.kayitlar ? r : O.veriGetir(O.aralikSorgu(bas, bas + 864e5 - 1000, cihaz)); })
      .then(function (r) {
        var K = r.kayitlar || [], c = Analiz.coz(K, { hizSinir: 1000, yerBul: Yerler.bul, yakinBul: Yerler.yakin })[0];
        var g = c && c.gunler.filter(function (x) { return x.bas === bas; })[0];
        var iz = K.filter(function (k) { return k.t >= bas && k.t < bas + 864e5 && k.lat !== null; });
        if (!g || iz.length < 2) { mesaj(I.gunYaz(gun) + ' için ham kayıtlar yok (silinmiş olabilir); hikâye oynatılamıyor.'); return; }
        var liste = [], duraklar = [], no = 0;
        g.olaylar.forEach(function (e) {
          var aralik = saat(e.t0) + '–' + (e.t1 >= bas + 864e5 ? '24:00' : saat(e.t1)), s = sure(e.t1 - e.t0);
          if (e.tur === 'yol') {
            if (e.t1 - e.t0 < 60e3 && e.mesafe < 100) return;
            liste.push({ t: e.t0, yazi: aralik + ' Yolculuk · ' + km(e.mesafe) + ' · ' + s });
          } else if (e.konum) {
            var yer = e.yer ? e.yer : 'konum';
            if (e.tur === 'bekle' && e.t1 - e.t0 < 60e3) return;
            no++;
            var yazi = aralik + (e.tur === 'bekle' ? ' ' + s + ' bekledi · ' : (e.tur === 'gps' ? ' GPS yok (' + s + ') · ' : ' Veri yok (' + s + ') · ')) + yer;
            duraklar.push({ no: no, konum: [e.konum.lat, e.konum.lon], etiket: yazi });
            liste.push({ t: e.t0, no: no, yazi: yazi, konum: [e.konum.lat, e.konum.lon] });
          } else liste.push({ t: e.t0, yazi: aralik + ' Veri yok (' + s + ')' });
        });
        mesaj('');
        O.haritadaGoster({ etiket: cihaz + ' · ' + I.gunYaz(gun), iz: iz, liste: liste, duraklar: duraklar });
      }).catch(function (e) { mesaj(O.hataMetni(e)); });
  }
  // O gün birden çok cihaz hareket ettiyse hangisi olduğu sorulur
  function hikaye(gun, veri) {
    var C = [];
    veri.tumGunler.forEach(function (g) { if (g.gun === gun && C.indexOf(g.cihaz) < 0) C.push(g.cihaz); });
    if (!C.length) { I.mesaj('Bu gün için veri yok.'); return; }
    if (C.length === 1) { hikayeOynat(C[0], gun); return; }
    var m = document.getElementById('rp-mesaj');
    m.innerHTML = 'Hangi cihazın günü? ' + C.sort().map(function (c) { return '<button type="button" class="az-git" data-hikaye-cihaz="' + esc(c) + '">' + esc(c) + '</button>'; }).join(' ');
    m.onclick = function (e) { var b = e.target.closest('[data-hikaye-cihaz]'); if (b) { m.onclick = null; hikayeOynat(b.getAttribute('data-hikaye-cihaz'), gun); } };
    m.scrollIntoView({ block: 'nearest' });
  }

  window.RaporEk = { kuralHtml: kuralHtml, tik: tik, hikaye: hikaye, hikayeOynat: hikayeOynat, ziyaretler: ziyaretler, sonUyarilar: sonUyarilar };
})();
