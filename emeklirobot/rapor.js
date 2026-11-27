/* Yolculuklar (defter + tekrar oynatma), dönem raporu ve sık güzergâhlar.
   Kaynak: sunucuda saklanan günlük özetler. Eksik/eski günler burada, analiz.js ile hesaplanıp yazılır; böylece
   20.000 satır sınırına takılmadan uzun dönem görülür ve ham loglar silinse de rapor kalır. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi, saat = O.saat, sure = O.sure, km = O.km;
  var SAYFA = 150;
  var sekme = 'yolculuk', veri = null, etiketler = [], no = 0, gosterilen = SAYFA, hedefler = [];
  var senkronSozu = null;

  /* ---------- Günlük özet eşitleme ---------- */
  function senkron(ilerleme) {
    if (!senkronSozu) senkronSozu = esitle(ilerleme || function () {}).then(function (v) { senkronSozu = null; return v; }, function (e) { senkronSozu = null; throw e; });
    return senkronSozu;
  }
  function esitle(ilerleme) {
    ilerleme('Kayıtlı günler kontrol ediliyor…');
    return O.ozellik('gunler').then(function (v) {
      var ham = {}, ozet = {}, eski = {}, atlanan = [];
      v.ham.forEach(function (r) { ham[r[0] + '|' + r[1]] = { cihaz: r[0], gun: r[1], adet: r[2], sonId: r[3] }; });
      v.ozet.forEach(function (r) { ozet[r[0] + '|' + r[1]] = { adet: r[2], sonId: r[3], surum: r[4] }; });
      Object.keys(ham).forEach(function (a) {
        var h = ham[a], o = ozet[a];
        // Ham kayıt sayısı azaldıysa (silme) ve yeni kayıt yoksa eski özet korunur
        if (!o || h.adet > o.adet || h.sonId > o.sonId || (o.surum < Analiz.ozetSurum && h.adet >= o.adet)) eski[a] = h;
      });
      // Gece yarısını aşan yolculuk için önceki gün de yeniden hesaplanır
      Object.keys(eski).forEach(function (a) {
        var h = eski[a], b = h.cihaz + '|' + O.gunEkle(h.gun, -1);
        if (ham[b] && !eski[b] && (!ozet[b] || ham[b].adet >= ozet[b].adet)) eski[b] = ham[b];
      });
      var cihazGun = {};
      Object.keys(eski).sort().forEach(function (a) { (cihazGun[eski[a].cihaz] = cihazGun[eski[a].cihaz] || []).push(eski[a]); });
      function hamToplam(cihaz, ilk, son) {
        var t = 0;
        for (var g = ilk; g <= son; g = O.gunEkle(g, 1)) if (ham[cihaz + '|' + g]) t += ham[cihaz + '|' + g].adet;
        return t;
      }
      var parcalar = [];
      Object.keys(cihazGun).forEach(function (c) {
        var p = null;
        cihazGun[c].forEach(function (h) {
          if (p && h.gun <= O.gunEkle(p.ilk, 20) && hamToplam(c, O.gunEkle(p.ilk, -1), O.gunEkle(h.gun, 1)) <= 15000) { p.son = h.gun; p.gunler[h.gun] = h; }
          else { p = { cihaz: c, ilk: h.gun, son: h.gun, gunler: {} }; p.gunler[h.gun] = h; parcalar.push(p); }
        });
      });
      var toplam = Object.keys(eski).length, biten = 0, sira = Promise.resolve();
      parcalar.forEach(function (p) {
        sira = sira.then(function () {
          ilerleme('Günlük özetler hazırlanıyor: ' + biten + ' / ' + toplam + ' gün…');
          function getir(pay) { return O.veriGetir(O.aralikSorgu(O.gunBasi(O.gunEkle(p.ilk, -pay)), O.gunBasi(O.gunEkle(p.son, 1 + pay)) - 1000, p.cihaz)); }
          return getir(1).then(function (r) { return r.kayitlar ? r : getir(0); }).then(function (r) {
            biten += Object.keys(p.gunler).length;
            if (!r.kayitlar) { atlanan.push(p.cihaz + ' ' + p.ilk); return null; }
            var yaz = Analiz.ozetle(r.kayitlar).filter(function (g) { return p.gunler[g.gun]; }).map(function (g) {
              var h = p.gunler[g.gun];
              return { cihaz: g.cihaz, gun: g.gun, adet: h.adet, sonId: h.sonId, surum: Analiz.ozetSurum, veri: g.veri };
            });
            var s = Promise.resolve();
            for (var i = 0; i < yaz.length; i += 15) {
              (function (dilim) { s = s.then(function () { return O.ozellik('ozet_kaydet', { gunler: dilim }); }); })(yaz.slice(i, i + 15));
            }
            return s;
          });
        });
      });
      return sira.then(function () {
        var cihazlar = [];
        v.ham.concat(v.ozet).forEach(function (r) { if (cihazlar.indexOf(r[0]) < 0) cihazlar.push(r[0]); });
        return { atlanan: atlanan, cihazlar: cihazlar.sort() };
      });
    });
  }

  /* ---------- Dönem ---------- */
  function donem() {
    var bugun = O.istGun(Date.now()), s = $('rp-donem').value, bas, bit = bugun;
    if (s === 'hafta') bas = O.gunEkle(bugun, -((new Date(bugun + 'T12:00:00Z').getUTCDay() + 6) % 7));
    else if (s === 'ay') bas = bugun.slice(0, 8) + '01';
    else if (s === 'ozel') { bas = $('rp-bas').value || O.gunEkle(bugun, -29); bit = $('rp-bit').value || bugun; if (bas > bit) { var t = bas; bas = bit; bit = t; } }
    else bas = O.gunEkle(bugun, -(Number(s) - 1));
    var uzunluk = Math.round((O.gunBasi(bit) - O.gunBasi(bas)) / 864e5) + 1;
    return { bas: bas, bit: bit, uzunluk: uzunluk, oncekiBas: O.gunEkle(bas, -uzunluk) };
  }
  function gunYaz(g) { return g.slice(8) + '.' + g.slice(5, 7) + '.' + g.slice(0, 4); }

  // Yolculuk uçları: kayıtlı yer adı, yoksa 150 m içindeki uçlar "Konum 1, 2…" olarak gruplanır
  function adlandirici() {
    var K = [];
    return function (lat, lon) {
      if (lat === null || lat === undefined) return null;
      var y = Yerler.bul(lat, lon);
      if (y) return { anahtar: y.anahtar, ad: y.ad, kayitli: true, lat: lat, lon: lon };
      for (var i = 0; i < K.length; i++) if (Analiz.mesafe(K[i], { lat: lat, lon: lon }) <= Analiz.ayar.YER_YARICAP) return K[i];
      var yeni = { anahtar: 'k' + (K.length + 1), ad: 'Konum ' + (K.length + 1), kayitli: false, lat: lat, lon: lon };
      K.push(yeni); return yeni;
    };
  }
  function ortanca(d) { if (!d.length) return 0; var s = d.slice().sort(function (a, b) { return a - b; }), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }

  function hazirla(gunler, d) {
    var secili = $('rp-cihaz').value, ad = adlandirici();
    var G = gunler.filter(function (g) { return !secili || g.cihaz === secili; });
    var Y = [], D = [];
    G.forEach(function (g) {
      (g.veri.yol || []).forEach(function (v) {
        Y.push({ cihaz: g.cihaz, gun: g.gun, t0: v[0] * 1000, t1: v[1] * 1000, m: v[2], maks: v[3], nereden: ad(v[4], v[5]), nereye: ad(v[6], v[7]) });
      });
      (g.veri.durak || []).forEach(function (v) { D.push({ cihaz: g.cihaz, gun: g.gun, t0: v[0] * 1000, t1: v[1] * 1000, yer: ad(v[2], v[3]), belirsiz: v[4] === 1 }); });
    });
    Y.sort(function (a, b) { return b.t0 - a.t0; });
    var icinde = function (x) { return x.gun >= d.bas && x.gun <= d.bit; };
    var guzergah = {};
    Y.forEach(function (y) {
      if (!y.nereden || !y.nereye || y.nereden.anahtar === y.nereye.anahtar) return;
      var a = y.nereden.anahtar + '>' + y.nereye.anahtar;
      var r = guzergah[a] = guzergah[a] || { nereden: y.nereden, nereye: y.nereye, hepsi: [] };
      r.hepsi.push(y); y.guzergah = r;
    });
    Object.keys(guzergah).forEach(function (a) {
      var r = guzergah[a];
      r.sure = ortanca(r.hepsi.map(function (y) { return y.t1 - y.t0; }));
      r.m = ortanca(r.hepsi.map(function (y) { return y.m; }));
    });
    return { d: d, gunler: G.filter(icinde), onceki: G.filter(function (g) { return g.gun < d.bas; }), yol: Y.filter(icinde), durak: D.filter(icinde),
      guzergah: Object.keys(guzergah).map(function (a) { return guzergah[a]; }) };
  }

  /* ---------- Yolculuk defteri ---------- */
  function etiketBul(y) {
    var en = null;
    etiketler.forEach(function (e) {
      if (e.cihaz !== y.cihaz) return;
      var ortak = Math.min(y.t1, e.t1 * 1000) - Math.max(y.t0, e.t0 * 1000), kisa = Math.min(y.t1 - y.t0, (e.t1 - e.t0) * 1000);
      if (ortak > 0 && ortak >= kisa * .5 && (!en || ortak > en.ortak)) en = { e: e, ortak: ortak };
    });
    return en ? en.e : null;
  }
  function turAdi(t) { return t === 'is' ? 'İş' : (t === 'ozel' ? 'Özel' : ''); }
  function suzulmus() {
    var f = $('rp-etiket').value;
    return veri.yol.filter(function (y) { var e = etiketBul(y), t = e ? e.tur : ''; return !f || (f === 'yok' ? !t : t === f); });
  }
  function ucHtml(u) {
    if (!u) return '<span>?</span>';
    if (u.kayitli) return '<b>' + esc(u.ad) + '</b>';
    hedefler.push({ kaydet: { lat: u.lat, lon: u.lon } });
    return '<button type="button" class="rp-uc" data-h="' + (hedefler.length - 1) + '" title="Bu konuma ad ver">' + esc(u.ad) + ' ✎</button>';
  }
  function kiyas(y) {
    var r = y.guzergah;
    if (!r || r.hepsi.length < 3) return '';
    var fark = (y.t1 - y.t0) - r.sure;
    if (Math.abs(fark) < 3 * 60e3) return '<span class="rp-kiyas">bu güzergâh genelde ' + sure(r.sure) + '</span>';
    var yavas = fark > 0 && (y.t1 - y.t0) > r.sure * 1.3;
    return '<span class="rp-kiyas' + (yavas ? ' uy' : '') + '">genelde ' + sure(r.sure) + ' · ' + (fark > 0 ? '+' : '−') + sure(Math.abs(fark)) + '</span>';
  }
  function yolculukCiz() {
    var L_ = suzulmus(), toplam = { is: [0, 0], ozel: [0, 0], '': [0, 0] };
    veri.yol.forEach(function (y) { var e = etiketBul(y), t = e ? e.tur : ''; toplam[t][0]++; toplam[t][1] += y.m; });
    var html = '<div class="rp-kartlar">' + [['İş', 'is'], ['Özel', 'ozel'], ['Etiketsiz', '']].map(function (x) {
      return '<div><span>' + x[0] + '</span><strong>' + km(toplam[x[1]][1]) + '</strong><small>' + toplam[x[1]][0] + ' yolculuk</small></div>';
    }).join('') + '</div>';
    if (!L_.length) return html + '<p class="not">Bu dönemde yolculuk yok.</p>';
    var gun = null;
    L_.slice(0, gosterilen).forEach(function (y) {
      if (y.gun !== gun) { html += (gun ? '</ul>' : '') + '<h4 class="rp-gun">' + esc(O.gunAd(O.gunBasi(y.gun) + 43200e3)) + '</h4><ul class="rp-yollar">'; gun = y.gun; }
      var e = etiketBul(y), i = veri.yol.indexOf(y);
      html += '<li data-yol="' + i + '"><div class="rp-saat">' + saat(y.t0) + ' – ' + saat(y.t1) + '<small>' + esc(y.cihaz) + '</small></div>' +
        '<div class="rp-bilgi"><div>' + ucHtml(y.nereden) + ' → ' + ucHtml(y.nereye) + '</div><small>' + sure(y.t1 - y.t0) + ' · ' + km(y.m) + (y.maks !== null ? ' · en yüksek ' + sayi(y.maks) + ' km/sa' : '') + '</small> ' + kiyas(y) + '</div>' +
        '<div class="rp-defter"><select class="rp-tur" aria-label="Yolculuk türü"><option value="">Tür seç</option><option value="is"' + (e && e.tur === 'is' ? ' selected' : '') + '>İş</option><option value="ozel"' + (e && e.tur === 'ozel' ? ' selected' : '') + '>Özel</option></select>' +
        '<input class="rp-not" maxlength="200" placeholder="Not" aria-label="Yolculuk notu" value="' + esc(e ? e.not : '') + '">' +
        '<button type="button" class="az-git rp-oynat">▶ Oynat</button></div></li>';
    });
    html += '</ul>';
    if (L_.length > gosterilen) html += '<p><button type="button" class="az-git" id="rp-fazla">Daha fazla göster (' + (L_.length - gosterilen) + ')</button></p>';
    return html;
  }

  function etiketKaydet(li) {
    var y = veri.yol[Number(li.getAttribute('data-yol'))], e = etiketBul(y);
    var govde = { id: e ? e.id : 0, cihaz: y.cihaz, t0: Math.round(y.t0 / 1000), t1: Math.round(y.t1 / 1000), tur: li.querySelector('.rp-tur').value, not: li.querySelector('.rp-not').value.trim() };
    mesaj('Kaydediliyor…');
    O.ozellik('etiket_kaydet', govde).then(function () { return O.ozellik('etiketler'); }).then(function (v) {
      etiketler = v.etiketler; mesaj('Kaydedildi.');
      if ($('rp-etiket').value) ciz(); else ozetKartlariYenile();
    }).catch(function (err) { mesaj(O.hataMetni(err)); });
  }
  function ozetKartlariYenile() { // listeyi yeniden çizmeden (yazılan not kaybolmasın) üst toplamlar güncellenir
    var d = document.createElement('div'); d.innerHTML = yolculukCiz();
    var yeni = d.querySelector('.rp-kartlar'), eski = $('rp-icerik').querySelector('.rp-kartlar');
    if (yeni && eski) eski.innerHTML = yeni.innerHTML;
  }

  function oynat(li) {
    var y = veri.yol[Number(li.getAttribute('data-yol'))];
    var etiket = (y.nereden ? y.nereden.ad : '?') + ' → ' + (y.nereye ? y.nereye.ad : '?') + ' · ' + O.kisaTarih(y.t0);
    mesaj('Yolculuk kayıtları alınıyor…');
    O.veriGetir(O.aralikSorgu(y.t0 - 1000, y.t1 + 1000, y.cihaz)).then(function (r) {
      var iz = (r.kayitlar || []).filter(function (k) { return k.lat !== null; });
      mesaj('');
      if (iz.length > 1) { O.haritadaGoster({ etiket: etiket, iz: iz }); return; }
      var uc = [y.nereden, y.nereye].filter(Boolean).map(function (u) { return [u.lat, u.lon]; });
      if (!uc.length) { mesaj('Bu yolculuğun kayıtları silinmiş; gösterilecek konum yok.'); return; }
      mesaj('Bu yolculuğun ham kayıtları silinmiş; yalnızca uç noktalar gösterildi.');
      O.haritadaGoster({ etiket: etiket + ' (yalnızca uçlar)', nokta: uc, konum: uc[0] });
    }).catch(function (e) { mesaj(O.hataMetni(e)); });
  }

  /* ---------- Rapor ---------- */
  function topla(gunler) {
    var t = { m: 0, surus: 0, yol: 0, gunler: {}, maks: null, gps: 0 };
    gunler.forEach(function (g) {
      var v = g.veri;
      t.m += v.m; t.surus += v.surus; t.gps += v.gps; t.yol += (v.yol || []).length;
      if ((v.yol || []).length) t.gunler[g.gun] = 1;
      if (v.maks !== null && (t.maks === null || v.maks > t.maks)) t.maks = v.maks;
    });
    t.aktif = Object.keys(t.gunler).length;
    return t;
  }
  function degisim(yeni, eski) {
    if (!eski) return '<small>önceki dönemde veri yok</small>';
    var y = Math.round((yeni - eski) / eski * 100);
    return '<small>önceki döneme göre ' + (y > 0 ? '▲ %' + y : (y < 0 ? '▼ %' + (-y) : 'aynı')) + '</small>';
  }
  function sutunlar(baslik, veriler, birim, sik) {
    var en = Math.max.apply(null, veriler.map(function (v) { return v.d; }).concat([0]));
    return '<div class="az-bolum"><h4>' + baslik + (en ? ' <span class="rp-tepe">en yüksek ' + birim(en) + '</span>' : '') + '</h4>' +
      (en ? '<div class="rp-grafik' + (sik ? ' sik' : '') + '">' + veriler.map(function (v) {
        return '<div title="' + esc(v.tam + ': ' + birim(v.d)) + '"><i style="height:' + (v.d / en * 100).toFixed(1) + '%"></i><span>' + esc(v.k) + '</span></div>';
      }).join('') + '</div>' : '<p class="not">Veri yok.</p>') + '</div>';
  }
  function takvim(d, gunKm) {
    if (d.uzunluk > 400) return '';
    var en = Math.max.apply(null, Object.keys(gunKm).map(function (g) { return gunKm[g]; }).concat([0]));
    var aylar = [], ay = null, g;
    for (g = d.bas; g <= d.bit; g = O.gunEkle(g, 1)) { if (g.slice(0, 7) !== ay) { ay = g.slice(0, 7); aylar.push({ ay: ay, gunler: [] }); } aylar[aylar.length - 1].gunler.push(g); }
    var adlar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return '<div class="az-bolum"><h4>Takvim (günlük yol)</h4><div class="rp-takvim">' + aylar.map(function (a) {
      var bos = (new Date(a.gunler[0] + 'T12:00:00Z').getUTCDay() + 6) % 7, h = '';
      for (var i = 0; i < bos; i++) h += '<i class="bos"></i>';
      h += a.gunler.map(function (x) {
        var v = gunKm[x] || 0, s = !v ? 0 : Math.min(4, Math.ceil(v / en * 4));
        return '<i class="s' + s + '" title="' + gunYaz(x) + ': ' + km(v) + '">' + Number(x.slice(8)) + '</i>';
      }).join('');
      return '<div><b>' + adlar[Number(a.ay.slice(5)) - 1] + ' ' + a.ay.slice(0, 4) + '</b><div class="rp-ay"><em>Pt</em><em>Sa</em><em>Ça</em><em>Pe</em><em>Cu</em><em>Ct</em><em>Pz</em>' + h + '</div></div>';
    }).join('') + '</div></div>';
  }
  function tablo(basliklar, satirlar) {
    return '<div class="rp-tablo"><table><thead><tr>' + basliklar.map(function (b) { return '<th>' + b + '</th>'; }).join('') + '</tr></thead><tbody>' +
      satirlar.map(function (s) { return '<tr>' + s.map(function (h) { return '<td>' + h + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function gunlukKm() {
    var r = {};
    veri.gunler.forEach(function (g) { r[g.gun] = (r[g.gun] || 0) + g.veri.m; });
    return r;
  }
  function raporCiz() {
    var d = veri.d, t = topla(veri.gunler), o = topla(veri.onceki), gunKm = gunlukKm();
    if (!veri.gunler.length) return '<p class="not">Bu dönem için veri yok.</p>';
    var html = '<div class="rp-kartlar">' + [
      ['Toplam yol', km(t.m), degisim(t.m, o.m)], ['Sürüş süresi', sure(t.surus * 1000), degisim(t.surus, o.surus)],
      ['Yolculuk', sayi(t.yol), degisim(t.yol, o.yol)], ['Hareketli gün', t.aktif + ' / ' + d.uzunluk, t.aktif ? '<small>hareketli gün başına ' + km(t.m / t.aktif) + '</small>' : ''],
      ['En yüksek hız', t.maks === null ? '—' : sayi(t.maks) + ' km/sa', ''], ['GPS alınamayan', sure(t.gps * 1000), '<small>bu sürede yol sayılmaz</small>']
    ].map(function (k) { return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong>' + k[2] + '</div>'; }).join('') + '</div>';

    var seri = [], g, haftalik = d.uzunluk > 62;
    for (g = d.bas; g <= d.bit; g = O.gunEkle(g, 1)) {
      if (!haftalik || !seri.length || new Date(g + 'T12:00:00Z').getUTCDay() === 1) seri.push({ k: g.slice(8) + '.' + g.slice(5, 7), tam: (haftalik ? 'Hafta ' : '') + gunYaz(g), d: 0 });
      seri[seri.length - 1].d += gunKm[g] || 0;
    }
    html += sutunlar(haftalik ? 'Haftalık yol' : 'Günlük yol', seri, km, seri.length > 14);
    html += takvim(d, gunKm);

    var saatler = [], h;
    for (h = 0; h < 24; h++) saatler.push({ k: String(h), tam: h + ':00–' + (h + 1) + ':00', d: 0 });
    veri.gunler.forEach(function (x) { (x.veri.saat || []).forEach(function (s, i) { saatler[i].d += s * 1000; }); });
    html += sutunlar('Günün hangi saatinde sürüş var (toplam süre)', saatler, sure, true);

    var hg = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(function (k) { return { k: k, tam: k, d: 0 }; });
    veri.gunler.forEach(function (x) { hg[(new Date(x.gun + 'T12:00:00Z').getUTCDay() + 6) % 7].d += x.veri.m; });
    html += sutunlar('Haftanın günlerine göre toplam yol', hg, km, false);

    var cihazlar = {};
    veri.gunler.forEach(function (x) { (cihazlar[x.cihaz] = cihazlar[x.cihaz] || []).push(x); });
    html += '<div class="az-bolum"><h4>Cihazlar</h4>' + tablo(['Cihaz', 'Yol', 'Sürüş', 'Yolculuk', 'Hareketli gün', 'En yüksek hız'], Object.keys(cihazlar).sort().map(function (c) {
      var x = topla(cihazlar[c]);
      return [esc(c), km(x.m), sure(x.surus * 1000), x.yol, x.aktif, x.maks === null ? '—' : sayi(x.maks) + ' km/sa'];
    })) + '</div>';

    var yerler = {};
    veri.durak.forEach(function (s) {
      if (!s.yer) return;
      var y = yerler[s.yer.anahtar] = yerler[s.yer.anahtar] || { yer: s.yer, sure: 0, belirsiz: 0, gun: {} };
      if (s.belirsiz) y.belirsiz += s.t1 - s.t0; else y.sure += s.t1 - s.t0;
      y.gun[s.cihaz + s.gun] = 1;
    });
    var Y = Object.keys(yerler).map(function (a) { return yerler[a]; }).sort(function (a, b) { return (b.sure + b.belirsiz) - (a.sure + a.belirsiz); }).slice(0, 12);
    if (Y.length) html += '<div class="az-bolum"><h4>En çok zaman geçirilen yerler</h4>' + tablo(['Yer', 'Bekleme', 'GPS’siz (büyük olasılıkla orada)', 'Gün'], Y.map(function (y) {
      return [ucHtml(y.yer), sure(y.sure), y.belirsiz ? sure(y.belirsiz) : '—', Object.keys(y.gun).length];
    })) + '<p class="not">İki cihaz aynı gün aynı yerdeyse “Gün” sütununda ayrı ayrı sayılır.</p></div>';
    return html;
  }

  /* ---------- Sık güzergâhlar ---------- */
  function guzergahCiz() {
    var d = veri.d;
    var R = veri.guzergah.map(function (r) {
      var L_ = r.hepsi.filter(function (y) { return y.gun >= d.bas && y.gun <= d.bit; }).sort(function (a, b) { return a.t0 - b.t0; });
      return { r: r, liste: L_ };
    }).filter(function (x) { return x.liste.length >= 2; }).sort(function (a, b) { return b.liste.length - a.liste.length; });
    if (!R.length) return '<p class="not">Bu dönemde en az iki kez gidilen bir güzergâh yok. Dönemi genişletmeyi deneyin.</p>';
    return tablo(['Güzergâh', 'Kez', 'Tipik süre', 'En kısa – en uzun', 'Tipik mesafe', 'Son gidiş'], R.slice(0, 30).map(function (x) {
      var s = x.liste.map(function (y) { return y.t1 - y.t0; }), son = x.liste[x.liste.length - 1], tipik = ortanca(s), fark = (son.t1 - son.t0) - tipik;
      return [ucHtml(x.r.nereden) + ' → ' + ucHtml(x.r.nereye), x.liste.length, sure(tipik), sure(Math.min.apply(null, s)) + ' – ' + sure(Math.max.apply(null, s)), km(ortanca(x.liste.map(function (y) { return y.m; }))),
        O.kisaTarih(son.t0) + '<br>' + sure(son.t1 - son.t0) + (Math.abs(fark) >= 3 * 60e3 ? ' <span class="rp-kiyas' + (fark > 0 && son.t1 - son.t0 > tipik * 1.3 ? ' uy' : '') + '">' + (fark > 0 ? '+' : '−') + sure(Math.abs(fark)) + '</span>' : '')];
    })) + '<p class="not">Güzergâh, başlangıç ve varış yerine göre gruplanır; izlenen yol farklı olabilir. Gidiş ve dönüş ayrı sayılır. “Tipik” değer ortancadır.</p>';
  }

  /* ---------- Excel / yazdırma ---------- */
  function indir(basliklar, satirlar, genislik, ad) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(Xlsx.blob(basliklar, satirlar, genislik, ad));
    a.download = 'emekli-robot-' + ad.toLowerCase() + '-' + veri.d.bas + '_' + veri.d.bit + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function excel() {
    if (!veri) return;
    if (sekme === 'rapor') {
      indir(['Gün', 'Cihaz', 'Yol (km)', 'Sürüş (dk)', 'Yolculuk', 'Bekleme (dk)', 'GPS yok (dk)', 'Veri yok (dk)', 'En yüksek hız'], veri.gunler.map(function (g) {
        var v = g.veri;
        return [gunYaz(g.gun), g.cihaz, Math.round(v.m / 100) / 10, Math.round(v.surus / 60), (v.yol || []).length, Math.round(v.bekleme / 60), Math.round(v.gps / 60), Math.round(v.yok / 60), v.maks];
      }), [12, 16, 10, 11, 10, 13, 13, 13, 13], 'Rapor');
    } else {
      var L_ = sekme === 'yolculuk' ? suzulmus() : veri.yol;
      indir(['Başlangıç', 'Bitiş', 'Cihaz', 'Nereden', 'Nereye', 'Süre (dk)', 'Mesafe (km)', 'En yüksek hız', 'Tür', 'Not'], L_.slice().reverse().map(function (y) {
        var e = etiketBul(y);
        return [new Date(y.t0), new Date(y.t1), y.cihaz, y.nereden ? y.nereden.ad : '', y.nereye ? y.nereye.ad : '', Math.round((y.t1 - y.t0) / 60e3), Math.round(y.m / 100) / 10, y.maks, e ? turAdi(e.tur) : '', e ? e.not : ''];
      }), [20, 20, 16, 24, 24, 10, 12, 13, 8, 30], 'Yolculuklar');
    }
  }
  function yazdir() {
    if (!veri) return;
    var eski = gosterilen; gosterilen = 1e9; ciz();
    $('rp-baski').textContent = 'Dönem: ' + gunYaz(veri.d.bas) + ' – ' + gunYaz(veri.d.bit) + ($('rp-cihaz').value ? ' · ' + $('rp-cihaz').value : ' · Tüm cihazlar');
    document.body.classList.add('yazdir-rapor');
    window.print();
    document.body.classList.remove('yazdir-rapor');
    gosterilen = eski; ciz();
  }

  /* ---------- Pencere ---------- */
  function mesaj(t) { $('rp-mesaj').textContent = t || ''; }
  function durumYaz(t, tur) {
    var d = $('rp-durum'); d.hidden = !t; d.className = 'az-durum' + (tur ? ' ' + tur : '');
    d.innerHTML = t ? (tur ? '' : '<span class="yk-halka" aria-hidden="true"></span>') + '<span>' + esc(t) + '</span>' : '';
  }
  function ciz() {
    if (!veri) return;
    hedefler = [];
    $('rp-icerik').innerHTML = sekme === 'yolculuk' ? yolculukCiz() : (sekme === 'rapor' ? raporCiz() : guzergahCiz());
  }
  var hamGunler = null;
  function yenidenHazirla() { if (hamGunler) { veri = hazirla(hamGunler.gunler, hamGunler.d); ciz(); } }

  function yukle() {
    var n = ++no, d = donem(), bilgi = '';
    veri = null; hamGunler = null; gosterilen = SAYFA; mesaj('');
    $('rp-icerik').innerHTML = '';
    durumYaz('Hazırlanıyor…');
    Yerler.hazir().then(function () { return senkron(function (t) { if (n === no) durumYaz(t); }); }).then(function (s) {
      if (n !== no) return null;
      if (s.atlanan.length) bilgi = 'Bazı günler çok yoğun olduğu için hesaplanamadı: ' + s.atlanan.join(', ');
      var secili = $('rp-cihaz').value;
      $('rp-cihaz').innerHTML = '<option value="">Tüm cihazlar</option>' + s.cihazlar.map(function (c) { return '<option' + (c === secili ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      durumYaz('Dönem verisi alınıyor…');
      return Promise.all([O.istek('/emeklirobot/ozellik.php?islem=ozetler&bas=' + d.oncekiBas + '&bit=' + d.bit), O.ozellik('etiketler')]);
    }).then(function (v) {
      if (!v || n !== no) return;
      etiketler = v[1].etiketler;
      if (v[0].kesildi) bilgi = 'Dönem çok uzun: sonuçlar eksik olabilir, dönemi daraltın.';
      hamGunler = { gunler: v[0].gunler, d: d };
      durumYaz('');
      mesaj(bilgi);
      yenidenHazirla();
    }).catch(function (e) { if (n === no && (!e || e.kod !== 'oturum')) { durumYaz(O.hataMetni(e), 'uyari'); if (window.console) console.error(e); } });
  }
  function sekmeSec(s) {
    sekme = s; gosterilen = SAYFA;
    [].forEach.call(document.querySelectorAll('#rp-sekmeler button'), function (b) { var a = b.getAttribute('data-sekme') === s; b.classList.toggle('acik', a); b.setAttribute('aria-selected', a ? 'true' : 'false'); });
    $('rp-etiket-kap').hidden = s !== 'yolculuk';
    $('rp-excel').hidden = s === 'guzergah';
    ciz();
  }
  function ac(s) { $('rpmodal').hidden = false; sekmeSec(s || 'yolculuk'); yukle(); }

  function baslat() {
    O.pencere('rpmodal', 'rpkapat', function () { no++; });
    $('rp-sekmeler').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) sekmeSec(b.getAttribute('data-sekme')); });
    $('rp-donem').addEventListener('change', function () {
      var ozel = this.value === 'ozel';
      $('rp-ozel').hidden = !ozel;
      if (ozel && !$('rp-bas').value) { $('rp-bit').value = O.istGun(Date.now()); $('rp-bas').value = O.gunEkle($('rp-bit').value, -29); }
      yukle();
    });
    $('rp-bas').addEventListener('change', yukle);
    $('rp-bit').addEventListener('change', yukle);
    $('rp-cihaz').addEventListener('change', function () { gosterilen = SAYFA; yenidenHazirla(); });
    $('rp-etiket').addEventListener('change', function () { gosterilen = SAYFA; ciz(); });
    $('rp-excel').addEventListener('click', excel);
    $('rp-yazdir').addEventListener('click', yazdir);
    $('rp-icerik').addEventListener('change', function (e) { if (e.target.matches('.rp-tur, .rp-not')) etiketKaydet(e.target.closest('li')); });
    $('rp-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'rp-fazla') { gosterilen += SAYFA; ciz(); }
      else if (b.classList.contains('rp-oynat')) oynat(b.closest('li'));
      else if (b.classList.contains('rp-uc')) Yerler.duzenle(hedefler[Number(b.getAttribute('data-h'))].kaydet);
    });
    Yerler.degisince(function () { if (!$('rpmodal').hidden || veri) yenidenHazirla(); });
  }

  window.Rapor = { baslat: baslat, ac: ac, senkron: senkron };
})();
