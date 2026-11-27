/* Kayıtlardan kural tabanlı analiz (yalnızca hesap; DOM yok, Node ile de denenebilir).
   Eşikler telefon uygulamasının log üretme kurallarına dayanır (hareketliyken ~15 sn'de bir KONUM, duruş 2 dk
   gecikmeyle ARAC_DURUYOR, park halinde ~15 dk'da bir DURUM). */
(function (kok) {
  'use strict';

  var A = {
    HAREKET_BOSLUK: 180e3,      // hareketliyken bundan uzun kayıt boşluğu: sürüş sayılmaz
    DURAGAN_BOSLUK: 35 * 60e3,  // park halinde DURUM ~15 dk'da bir gelir (uyku modunda gecikebilir)
    YAVAS_KMH: 5,
    DURUS_YARICAP: 60,          // duruş kuyruğu bu yarıçap içinde kalmalı (m)
    DURUS_GERI: 300e3,          // ARAC_DURUYOR'dan en çok bu kadar geriye gidilir
    KISA_DURAKLAMA: 30e3,
    YER_YARICAP: 150,
    UZUN_BEKLEME: 60 * 60e3,
    ROLANTI: 5 * 60e3,
    SAAT_FARKI: 3 * 3600e3      // Europe/Istanbul = UTC+3 (sabit)
  };

  function konumlu(k) { return k.lat !== null && k.lon !== null; }
  function mesafe(a, b) {
    var r = Math.PI / 180, dp = (b.lat - a.lat) * r, dl = (b.lon - a.lon) * r;
    var q = Math.pow(Math.sin(dp / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dl / 2), 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(q));
  }
  function ortanca(d) {
    if (!d.length) return null;
    var s = d.slice().sort(function (x, y) { return x - y; }), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function gunBasi(t) { return Math.floor((t + A.SAAT_FARKI) / 864e5) * 864e5 - A.SAAT_FARKI; }

  function hareketliMi(k) {
    if (k.tip === 'DURUM') return k.har === true;
    if (k.tip === 'ARAC_DURUYOR') return false;
    if (k.tip === 'KONUM' || k.tip === 'ARAC_HAREKET') return true;
    return k.har;
  }

  // Ardışık iki kayıt arasındaki her aralığa bir tür verir: yol | bekle | gps | yok
  function araliklar(K) {
    var T = [], i, a, b, dt, h, durum = false;
    for (i = 0; i < K.length - 1; i++) {
      a = K[i]; b = K[i + 1]; dt = b.t - a.t;
      h = hareketliMi(a);
      if (h === null) h = durum;
      durum = h;
      if (a.tip === 'KONUM_ALINAMADI' && dt > A.HAREKET_BOSLUK) T.push('gps');
      else if (a.tip === 'DURUM' && a.har === true) T.push(dt <= A.DURAGAN_BOSLUK ? 'gps' : 'yok');
      else if (h) T.push(dt <= A.HAREKET_BOSLUK ? 'yol' : 'yok');
      else T.push(dt <= A.DURAGAN_BOSLUK ? 'bekle' : 'yok');
    }
    duzelt(K, T);
    return T;
  }

  function duzelt(K, T) {
    var i, j, son, bas;
    // j'den geriye: aynı noktada kalan yavaş KONUM kuyruğunun ilk kaydı
    function kuyrukBasi(bitis, merkez, an) {
      var ilk = bitis;
      for (var n = bitis - 1; n >= 0; n--) {
        var k = K[n];
        if (T[n] !== 'yol' || k.tip !== 'KONUM' || k.hiz === null || k.hiz > A.YAVAS_KMH) break;
        if (an - k.t > A.DURUS_GERI || !konumlu(k) || !konumlu(merkez) || mesafe(k, merkez) > A.DURUS_YARICAP) break;
        ilk = n;
      }
      return ilk;
    }
    for (i = 1; i < K.length; i++) {
      // ARAC_DURUYOR ~2 dk gecikmeli yazılır: bekleme, ilk yavaş kayıttan başlatılır
      if (K[i].tip === 'ARAC_DURUYOR' && T[i - 1] === 'yol') {
        bas = kuyrukBasi(i, K[i], K[i].t);
        for (j = bas; j < i; j++) T[j] = 'bekle';
      }
    }
    for (i = 1; i < T.length; i++) {
      if (T[i] !== 'gps' || K[i].tip !== 'KONUM_ALINAMADI' || T[i - 1] !== 'yol') continue;
      // Sinyal son konumlu kayıttan hemen sonra kesildi: o aralık ve öncesindeki yavaş kuyruk da GPS yok sayılır
      son = i - 1;
      T[son] = 'gps';
      bas = kuyrukBasi(son, K[son], K[i].t);
      for (j = bas; j < son; j++) T[j] = 'gps';
    }
    // Sinyal dönünce gecikmeli yazılan ARAC_DURUYOR ile kısa süre sonraki hareket de aynı döneme aittir
    for (i = 1; i < T.length; i++) {
      if (T[i - 1] !== 'gps' || K[i].tip !== 'ARAC_DURUYOR') continue;
      var n = i;
      while (n < T.length && T[n] === 'bekle' && K[n + 1].t - K[i].t <= A.DURUS_GERI) n++;
      if (n > i && K[n] && K[n].tip === 'ARAC_HAREKET') for (j = i; j < n; j++) T[j] = 'gps';
    }
  }

  function bolumle(K, T) {
    var S = [], i;
    for (i = 0; i < T.length; i++) {
      var son = S[S.length - 1];
      if (son && son.tur === T[i]) { son.i1 = i + 1; son.t1 = K[i + 1].t; }
      else S.push({ tur: T[i], i0: i, i1: i + 1, t0: K[i].t, t1: K[i + 1].t });
    }
    return S;
  }

  function oncekiKonum(K, i) { for (; i >= 0; i--) if (konumlu(K[i])) return K[i]; return null; }
  function sonrakiKonum(K, i) { for (; i < K.length; i++) if (konumlu(K[i])) return K[i]; return null; }
  function merkez(liste) {
    var p = liste.filter(konumlu);
    if (!p.length) return null;
    return { lat: ortanca(p.map(function (k) { return k.lat; })), lon: ortanca(p.map(function (k) { return k.lon; })) };
  }

  function bolumBilgisi(K, s) {
    var ic = K.slice(s.i0, s.i1 + 1);
    if (s.tur === 'bekle') {
      s.konum = merkez(ic.slice(0, -1).concat(ic[ic.length - 1].tip === 'ARAC_HAREKET' ? [] : [ic[ic.length - 1]])) || merkez(ic);
      s.yayilim = s.konum ? ic.slice(0, -1).filter(konumlu).reduce(function (m, k) { return Math.max(m, mesafe(s.konum, k)); }, 0) : null;
    } else if (s.tur === 'gps' || s.tur === 'yok') {
      var o = oncekiKonum(K, s.i0), n = sonrakiKonum(K, s.i1);
      // GPS kesilmesinde "aynı yerde mi" sorusu: kesilmeden önceki son konum ile sinyal dönünce alınan ilk konum
      // GPS yokken yazılan DURUM kayıtları eski konumu taşır; "sonraki konum" sayılmaz
      for (var x = s.i0; x < s.i1; x++) {
        if (K[x].tip !== 'KONUM_ALINAMADI') continue;
        o = oncekiKonum(K, x);
        var y = x + 1;
        while (y < K.length && (!konumlu(K[y]) || (K[y].tip === 'DURUM' && K[y].har === true))) y++;
        n = K[y] || null;
        break;
      }
      s.fark = o && n ? mesafe(o, n) : null;
      s.konum = o || n;
      s.sonraki = n;
    }
  }

  // Yakın duraklar "Yer A, Yer B…" diye gruplanır
  function yerAdi(n) { var h = ''; do { h = String.fromCharCode(65 + n % 26) + h; n = Math.floor(n / 26) - 1; } while (n >= 0); return 'Yer ' + h; }
  // yerBul(lat, lon) -> {anahtar, ad} (kayıtlı yer) ya da null; yakinBul -> yakındaki kayıtlı yer ipucu
  function yerler(S, ayar) {
    var Y = [], harf = 0;
    S.forEach(function (s) {
      var durak = (s.tur === 'bekle' && s.t1 - s.t0 >= 60e3) || ((s.tur === 'gps' || s.tur === 'yok') && s.fark !== null && s.fark <= A.YER_YARICAP);
      if (!durak || !s.konum) return;
      var y = null, i, kayitli = ayar.yerBul ? ayar.yerBul(s.konum.lat, s.konum.lon) : null;
      for (i = 0; i < Y.length; i++) {
        if (kayitli ? Y[i].anahtar === kayitli.anahtar : (!Y[i].anahtar && mesafe(Y[i], s.konum) <= A.YER_YARICAP)) { y = Y[i]; break; }
      }
      if (!y) {
        y = { ad: kayitli ? kayitli.ad : yerAdi(harf++), anahtar: kayitli ? kayitli.anahtar : null, lat: s.konum.lat, lon: s.konum.lon, adet: 0, sure: 0, belirsizSure: 0,
          yakin: !kayitli && ayar.yakinBul ? ayar.yakinBul(s.konum.lat, s.konum.lon) : null };
        Y.push(y);
      }
      y.adet++;
      if (s.tur === 'bekle') y.sure += s.t1 - s.t0; else y.belirsizSure += s.t1 - s.t0;
      s.yer = y.ad;
    });
    return Y;
  }

  // Bölümün [bas, bit] penceresine düşen kısmı (gece yarısını aşan bölümler günlere ayrılır)
  function kes(K, T, s, bas, bit) {
    var p = { tur: s.tur, t0: Math.max(s.t0, bas), t1: Math.min(s.t1, bit), oncedenSuruyor: s.t0 < bas, sonraSuruyor: s.t1 > bit,
      konum: s.konum || null, yer: s.yer || null, fark: s.fark === undefined ? null : s.fark, yayilim: s.yayilim === undefined ? null : s.yayilim,
      tamSure: s.t1 - s.t0, ilkVeri: s.i0 === 0 };
    if (s.tur !== 'yol') return p;
    var yol = 0, maks = null, nokta = [], kisa = [], seri = [], i, k;
    for (i = s.i0; i < s.i1; i++) {
      var a = K[i], b = K[i + 1], dt = b.t - a.t, kesisim = Math.min(b.t, bit) - Math.max(a.t, bas);
      if (kesisim <= 0 || !konumlu(a) || !konumlu(b) || dt <= 0) continue;
      var d = mesafe(a, b);
      if (d / (dt / 1000) * 3.6 <= 200) yol += d * kesisim / dt; // imkânsız sıçrama mesafeye eklenmez
    }
    function seriBitir() {
      if (seri.length > 1) {
        var sure = seri[seri.length - 1].t - seri[0].t, c = merkez(seri);
        if (sure >= A.KISA_DURAKLAMA && c && seri.filter(konumlu).every(function (x) { return mesafe(c, x) <= A.DURUS_YARICAP; })) {
          kisa.push({ t0: seri[0].t, t1: seri[seri.length - 1].t, konum: c });
        }
      }
      seri = [];
    }
    for (i = s.i0; i <= s.i1; i++) {
      k = K[i];
      if (k.t < bas || k.t > bit) continue;
      if (konumlu(k)) nokta.push([k.lat, k.lon]);
      // Bölüm sonundaki kayıt bir sonraki bölümün (bekleme/GPS yok) başlangıcıdır
      if (i < s.i1 && k.hiz !== null && (!maks || k.hiz > maks.hiz)) maks = { hiz: k.hiz, t: k.t, konum: konumlu(k) ? k : null };
      if (i < s.i1 && k.tip === 'KONUM' && k.hiz !== null && k.hiz <= A.YAVAS_KMH) seri.push(k); else seriBitir();
    }
    seriBitir();
    p.mesafe = yol; p.maks = maks; p.nokta = nokta; p.kisa = kisa;
    p.ort = p.t1 > p.t0 ? yol / ((p.t1 - p.t0) / 1000) * 3.6 : 0;
    return p;
  }

  var UC_PAYI = 400; // "harekete geçti" kaydı duraktan 40-180 m ileride gelebilir
  // Yolculuğun başlangıç/varış noktası: mümkünse önceki/sonraki durağın konumu (yer adları için daha doğru)
  function uclar(S, i, nokta) {
    function sec(durak, p) {
      if (!p) return durak && durak.konum ? [durak.konum.lat, durak.konum.lon] : null;
      if (durak && durak.konum && (durak.tur === 'bekle' || (durak.fark !== null && durak.fark <= A.YER_YARICAP)) &&
        mesafe(durak.konum, { lat: p[0], lon: p[1] }) <= UC_PAYI) return [durak.konum.lat, durak.konum.lon];
      return p;
    }
    return { bas: sec(S[i - 1], nokta[0]), bit: sec(S[i + 1], nokta[nokta.length - 1]) };
  }
  function kisaYol(p) { return p.t1 - p.t0 < 60e3 && p.mesafe < 100; }

  function ucEkle(S, olay) {
    olay.forEach(function (e) {
      if (e.tur !== 'yol') return;
      var u = uclar(S, e.sira, e.tumNokta);
      e.basUc = u.bas; e.bitUc = u.bit;
    });
  }

  function gunler(K, T, S) {
    if (!K.length) return [];
    var G = [], g = gunBasi(K[0].t), son = gunBasi(K[K.length - 1].t), i = 0;
    for (; g <= son; g += 864e5) {
      var bit = g + 864e5;
      while (i < K.length && K[i].t < g) i++;
      var kayit = [];
      for (var j = i; j < K.length && K[j].t < bit; j++) kayit.push(K[j]);
      var olay = [];
      S.forEach(function (s, no) {
        if (!(s.t1 > g && s.t0 < bit)) return;
        var p = kes(K, T, s, g, bit);
        if (p.tur === 'yol') { p.sira = no; p.tumNokta = s.t0 >= g && s.t1 <= bit ? p.nokta : kes(K, T, s, s.t0, s.t1).nokta; }
        olay.push(p);
      });
      ucEkle(S, olay);
      // Hiç kaydı olmayan ve yalnızca "veri yok" içeren günler listelenmez
      if (!kayit.length && !olay.some(function (o) { return o.tur !== 'yok'; })) continue;
      G.push({ bas: g, kayitSayisi: kayit.length, olaylar: olay, ozet: gunOzeti(kayit, olay) });
    }
    return G;
  }

  function gunOzeti(kayit, olay) {
    var o = { yolculuk: 0, surus: 0, mesafe: 0, bekleme: 0, gps: 0, veriYok: 0, maks: null, ilkHareket: null, sonDurus: null, kisaAdet: 0, enUzun: null, yayilim: null };
    olay.forEach(function (e, n) {
      var sure = e.t1 - e.t0;
      if (e.tur === 'yol') {
        // Birkaç saniyelik, yer değiştirmesiz parçalar yolculuk sayılmaz
        if (sure < 60e3 && e.mesafe < 100) return;
        o.yolculuk++; o.surus += sure; o.mesafe += e.mesafe; o.kisaAdet += e.kisa.length;
        if (e.maks && (!o.maks || e.maks.hiz > o.maks.hiz)) o.maks = e.maks;
        if (o.ilkHareket === null && !e.oncedenSuruyor) o.ilkHareket = e.t0;
        o.sonDurus = olay[n + 1] && olay[n + 1].tur === 'bekle' ? e.t1 : null;
      } else if (e.tur === 'bekle') {
        o.bekleme += sure;
        if (!o.enUzun || sure > o.enUzun.t1 - o.enUzun.t0) o.enUzun = e;
      } else if (e.tur === 'gps') o.gps += sure;
      else o.veriYok += sure;
    });
    if (!o.yolculuk) {
      var c = merkez(kayit);
      if (c) o.yayilim = kayit.filter(konumlu).reduce(function (m, k) { return Math.max(m, mesafe(c, k)); }, 0);
    }
    return o;
  }

  function hizOlaylari(K, sinir) {
    var O = [], acik = null;
    K.forEach(function (k) {
      if (k.hiz !== null && k.hiz > sinir) {
        if (acik && k.t - acik.t1 <= 60e3) { acik.t1 = k.t; acik.adet++; if (konumlu(k)) acik.nokta.push([k.lat, k.lon]); if (k.hiz > acik.maks) { acik.maks = k.hiz; acik.konum = konumlu(k) ? k : acik.konum; } }
        else { acik = { t0: k.t, t1: k.t, adet: 1, maks: k.hiz, konum: konumlu(k) ? k : null, nokta: konumlu(k) ? [[k.lat, k.lon]] : [] }; O.push(acik); }
      } else if (k.hiz !== null) acik = null;
    });
    return O;
  }

  function kontak(K, S) {
    var evet = false, hayir = false;
    K.forEach(function (k) { if (k.sarj === true) evet = true; if (k.sarj === false) hayir = true; });
    var olaylar = K.filter(function (k) { return k.tip === 'SARJ_BASLADI' || k.tip === 'SARJ_KESILDI'; });
    // Şarj durumu hiç değişmediyse (telefon hep takılı ya da hiç takılı değil) kontak hakkında sonuç çıkarılmaz
    if (!(evet && hayir) && !olaylar.length) return { belirlenebilir: false, hep: evet ? 'Evet' : (hayir ? 'Hayır' : null) };
    var rolanti = [];
    S.forEach(function (s) {
      if (s.tur !== 'bekle') return;
      var bas = null, son = null;
      function bitir() { if (bas !== null && son - bas >= A.ROLANTI) rolanti.push({ t0: bas, t1: son, konum: s.konum, yer: s.yer || null }); bas = null; }
      for (var i = s.i0; i < s.i1; i++) {
        if (K[i].sarj === true) { if (bas === null) bas = K[i].t; son = K[i + 1].t; } else bitir();
      }
      bitir();
    });
    return { belirlenebilir: true, olaylar: olaylar.map(function (k) { return { tip: k.tip, t: k.t, konum: konumlu(k) ? k : null }; }), rolanti: rolanti };
  }

  function saglik(K, S) {
    var pil = K.filter(function (k) { return k.pil !== null; }), sic = null, acc = [], gec = [], say = {};
    K.forEach(function (k) {
      say[k.tip] = (say[k.tip] || 0) + 1;
      if (k.sic !== null && (!sic || k.sic > sic.sic)) sic = k;
      if (k.acc !== null) acc.push(k.acc);
      if (k.alinma !== null) gec.push(Math.max(0, k.alinma - k.t));
    });
    var dusukSarjda = false;
    for (var i = 1; i < pil.length; i++) if (pil[i].sarj === true && pil[i - 1].sarj === true && pil[i].pil <= pil[i - 1].pil - 5) dusukSarjda = true;
    return {
      pilIlk: pil.length ? pil[0].pil : null, pilSon: pil.length ? pil[pil.length - 1].pil : null,
      pilMin: pil.length ? pil.reduce(function (m, k) { return Math.min(m, k.pil); }, 100) : null,
      sarjdaDusus: dusukSarjda, sicMaks: sic ? { deger: sic.sic, t: sic.t } : null,
      isinma: say.CIHAZ_ISINDI || 0, kritik: say.CIHAZ_KRITIK_ISINDI || 0, konumYok: say.KONUM_ALINAMADI || 0,
      accOrtanca: ortanca(acc), zayifKonum: acc.filter(function (x) { return x > 50; }).length,
      gecikmeOrtanca: ortanca(gec), gecikmeMaks: gec.reduce(function (m, x) { return Math.max(m, x); }, 0),
      gpsDonem: S.filter(function (s) { return s.tur === 'gps'; }).length,
      veriYokDonem: S.filter(function (s) { return s.tur === 'yok'; }).length
    };
  }

  /* kayitlar: {cihaz, tip, t(ms), lat, lon, acc, hiz, pil, sarj(bool|null), sic, har(bool|null), alinma(ms|null)}, eskiden yeniye */
  function coz(kayitlar, ayar) {
    var grup = {};
    kayitlar.forEach(function (k) { (grup[k.cihaz] = grup[k.cihaz] || []).push(k); });
    return Object.keys(grup).sort().map(function (ad) {
      var K = grup[ad].slice().sort(function (x, y) { return x.t - y.t; });
      var T = araliklar(K), S = bolumle(K, T);
      S.forEach(function (s) { bolumBilgisi(K, s); });
      var Y = yerler(S, ayar), G = gunler(K, T, S), son = K[K.length - 1];
      var toplam = { yolculuk: 0, surus: 0, mesafe: 0, bekleme: 0, maks: null };
      G.forEach(function (g) {
        toplam.surus += g.ozet.surus; toplam.mesafe += g.ozet.mesafe; toplam.bekleme += g.ozet.bekleme;
        if (g.ozet.maks && (!toplam.maks || g.ozet.maks.hiz > toplam.maks.hiz)) toplam.maks = g.ozet.maks;
      });
      toplam.yolculuk = S.filter(function (s) { // gece yarısını aşan yolculuk bir kez sayılır
        if (s.tur !== 'yol') return false;
        var p = kes(K, T, s, s.t0, s.t1);
        return !(s.t1 - s.t0 < 60e3 && p.mesafe < 100);
      }).length;
      return {
        ad: ad, kayitSayisi: K.length, ilk: K[0].t, son: son.t, sonTip: son.tip, sonHiz: son.hiz, sonHareketli: hareketliMi(son), sonKonum: oncekiKonum(K, K.length - 1),
        sonBolum: S.length ? { tur: S[S.length - 1].tur, t0: S[S.length - 1].t0, ilkVeri: S[S.length - 1].i0 === 0 } : null,
        toplam: toplam, gunler: G, yerler: Y, hiz: hizOlaylari(K, ayar.hizSinir), kontak: kontak(K, S), saglik: saglik(K, S)
      };
    });
  }

  /* Sunucuda saklanan günlük özet (rapor, yolculuk listesi, bakım km). Biçim değişirse OZET_SURUM artırılır.
     Zamanlar epoch saniye. yol: [t0, t1, metre, enYuksekHiz|null, basLat, basLon, bitLat, bitLon] (başladığı güne yazılır)
     durak: [t0, t1, lat, lon, belirsiz(0|1)] (güne kırpılmış, en az 1 dk)
     gpsy: [t0, t1, lat, lon, donusFarki(m)|null] GPS'siz dönemler (başladığı güne yazılır; konum = kesilmeden önceki son konum) */
  var OZET_SURUM = 3; // 2: cihaz sağlığı (sag), 3: GPS kayıp noktaları (gpsy)
  // O günün cihaz sağlığı: gönderim gecikmesi (sn), GPS kaybı, ısınma, sıcaklık, pil, doğruluk, en uzun kayıtsız süre (sn)
  function gunSagligi(K, g) {
    var bit = g.bas + 864e5, G = K.filter(function (k) { return k.t >= g.bas && k.t < bit; });
    var s = saglik(G, []);
    var sessiz = g.olaylar.reduce(function (m, e) { return e.tur === 'yok' ? Math.max(m, e.t1 - e.t0) : m; }, 0);
    return { adet: G.length, gecO: s.gecikmeOrtanca === null ? null : Math.round(s.gecikmeOrtanca / 1000), gecM: Math.round(s.gecikmeMaks / 1000),
      konumYok: s.konumYok, isinma: s.isinma, kritik: s.kritik, sicM: s.sicMaks ? s.sicMaks.deger : null, pilMin: s.pilMin,
      sarjDusus: s.sarjdaDusus ? 1 : 0, acc: s.accOrtanca, zayif: s.zayifKonum, sessiz: Math.round(sessiz / 1000) };
  }
  function ozetle(kayitlar) {
    var grup = {}, cikti = [];
    kayitlar.forEach(function (k) { (grup[k.cihaz] = grup[k.cihaz] || []).push(k); });
    function sn(t) { return Math.round(t / 1000); }
    function yuvarla(x) { return Math.round(x * 1e6) / 1e6; }
    Object.keys(grup).sort().forEach(function (ad) {
      var K = grup[ad].slice().sort(function (x, y) { return x.t - y.t; });
      var T = araliklar(K), S = bolumle(K, T);
      S.forEach(function (s) { bolumBilgisi(K, s); });
      var yolculuklar = [];
      S.forEach(function (s, i) {
        if (s.tur !== 'yol') return;
        var p = kes(K, T, s, s.t0, s.t1);
        if (kisaYol(p)) return;
        var u = uclar(S, i, p.nokta);
        yolculuklar.push({ gun: gunBasi(s.t0), v: [sn(s.t0), sn(s.t1), Math.round(p.mesafe), p.maks ? p.maks.hiz : null,
          u.bas ? yuvarla(u.bas[0]) : null, u.bas ? yuvarla(u.bas[1]) : null, u.bit ? yuvarla(u.bit[0]) : null, u.bit ? yuvarla(u.bit[1]) : null] });
      });
      var kayiplar = [];
      S.forEach(function (s) {
        if (s.tur !== 'gps' || !s.konum || s.t1 - s.t0 < 60e3) return;
        kayiplar.push({ gun: gunBasi(s.t0), v: [sn(s.t0), sn(s.t1), yuvarla(s.konum.lat), yuvarla(s.konum.lon), s.fark === null ? null : Math.round(s.fark)] });
      });
      gunler(K, T, S).forEach(function (g) {
        var o = g.ozet, saat = [], durak = [], h;
        for (h = 0; h < 24; h++) saat.push(0);
        g.olaylar.forEach(function (e) {
          if (e.tur === 'yol' && !kisaYol(e)) {
            for (var t = e.t0; t < e.t1;) {
              var sira = Math.floor((t - g.bas) / 3600e3), son = Math.min(e.t1, g.bas + (sira + 1) * 3600e3);
              saat[sira] += (son - t) / 1000; t = son;
            }
          } else if (e.konum && e.t1 - e.t0 >= 60e3 && (e.tur === 'bekle' || (e.fark !== null && e.fark <= A.YER_YARICAP))) {
            durak.push([sn(e.t0), sn(e.t1), yuvarla(e.konum.lat), yuvarla(e.konum.lon), e.tur === 'bekle' ? 0 : 1]);
          }
        });
        var yol = yolculuklar.filter(function (y) { return y.gun === g.bas; }).map(function (y) { return y.v; });
        cikti.push({ cihaz: ad, gun: new Date(g.bas + A.SAAT_FARKI).toISOString().slice(0, 10), veri: {
          surus: sn(o.surus), m: Math.round(o.mesafe), bekleme: sn(o.bekleme), gps: sn(o.gps), yok: sn(o.veriYok),
          maks: o.maks ? o.maks.hiz : null, maksT: o.maks ? sn(o.maks.t) : null, saat: saat.map(Math.round), yol: yol, durak: durak, sag: gunSagligi(K, g),
          gpsy: kayiplar.filter(function (x) { return x.gun === g.bas; }).map(function (x) { return x.v; }) } });
      });
    });
    return cikti;
  }

  kok.Analiz = { coz: coz, ozetle: ozetle, ozetSurum: OZET_SURUM, mesafe: mesafe, ayar: A };
  if (typeof module !== 'undefined' && module.exports) module.exports = kok.Analiz;
})(typeof window !== 'undefined' ? window : this);
