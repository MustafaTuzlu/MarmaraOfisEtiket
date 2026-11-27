/* "Analiz et" penceresi: filtreye uyan kayıtları sunucudan çeker (önce sayar), analiz.js ile çözer ve gösterir. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var HIZ_VARSAYILAN = 90, UC_DK = 150;
  var harita = null, sorgu = null;
  var kayitlar = null, sonuc = null, istekNo = 0, iptal = null;
  var hedefler = []; // "Haritada göster" düğmelerinin verisi
  var katman = null, donKontrol = null, kaydirma = 0;
  var hizSinir = HIZ_VARSAYILAN;
  try { var h = Number(localStorage.getItem('er_hiz_sinir')); if (h >= 10 && h <= 300) hizSinir = Math.round(h); } catch (e) {}

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sayi(n, k) { return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: k || 0, maximumFractionDigits: k || 0 }); }
  function bicim(ayar) { var f = new Intl.DateTimeFormat('tr-TR', ayar); return function (t) { return f.format(new Date(t)); }; }
  var saat = bicim({ timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });
  var gunAd = bicim({ timeZone: 'Europe/Istanbul', day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
  var kisaTarih = bicim({ timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  function sure(ms) {
    if (ms < 60e3) return Math.round(ms / 1000) + ' sn';
    var dk = Math.round(ms / 60e3);
    if (dk < 60) return dk + ' dk';
    return Math.floor(dk / 60) + ' sa' + (dk % 60 ? ' ' + (dk % 60) + ' dk' : '');
  }
  function km(m) { return sayi(m / 1000, 1) + ' km'; }
  function metre(m) { return m >= 1000 ? km(m) : Math.round(m) + ' m'; }
  function bitisSaat(t, gunBas) { return t >= gunBas + 864e5 ? '24:00' : saat(t); }

  function dugme(hedef, yazi) {
    if (!hedef || !(hedef.nokta && hedef.nokta.length) && !hedef.konum) return '';
    hedefler.push(hedef);
    return '<button type="button" class="az-git" data-hedef="' + (hedefler.length - 1) + '">' + (yazi || 'Haritada') + '</button>';
  }
  function konumHedef(k, etiket) { return k ? { konum: [k.lat, k.lon], etiket: etiket } : null; }
  function cip(yazi, tur) { return '<span class="az-cip' + (tur ? ' ' + tur : '') + '">' + yazi + '</span>'; }

  /* ---------- Gün ---------- */
  function gunCumleleri(c, g) {
    var o = g.ozet, s = [];
    if (!o.yolculuk) {
      if (o.bekleme && !o.gps && !o.veriYok) {
        s.push('Bu gün için hareket kaydı yok: araç ' + sure(o.bekleme) + ' boyunca sabit durmuş görünüyor' +
          (o.yayilim !== null ? ' (konumlar en çok ' + metre(o.yayilim) + ' yayılmış)' : '') + '.');
      } else s.push('Bu gün için yolculuk tespit edilmedi.');
    } else {
      s.push((o.ilkHareket !== null ? 'Günün ilk hareketi ' + saat(o.ilkHareket) + '. ' : '') + o.yolculuk + ' yolculukta toplam ' + sure(o.surus) +
        ' sürüş, yaklaşık ' + km(o.mesafe) + ' yol.');
      if (o.maks) s.push('Görülen en yüksek hız ' + sayi(o.maks.hiz) + ' km/sa (' + saat(o.maks.t) + ').');
      if (o.enUzun) s.push('En uzun bekleme ' + sure(o.enUzun.t1 - o.enUzun.t0) + ' (' + saat(o.enUzun.t0) + '–' + bitisSaat(o.enUzun.t1, g.bas) + (o.enUzun.yer ? ', ' + o.enUzun.yer : '') + ').');
      if (o.kisaAdet) s.push('Yolculuklar sırasında ' + o.kisaAdet + ' kısa duraklama.');
    }
    if (o.gps) s.push(sure(o.gps) + ' boyunca GPS alınamadı.');
    if (o.veriYok) s.push(sure(o.veriYok) + ' için kayıt yok.');
    return s.join(' ');
  }

  function olayHtml(c, g, e, sonraki) {
    var baslik = '', alt = [], hedef = null, ekCip = '', tur = e.tur;
    var aralik = saat(e.t0) + ' – ' + bitisSaat(e.t1, g.bas), s = e.t1 - e.t0;
    if (tur === 'yol') {
      baslik = 'Yolculuk · ' + sure(s) + ' · yaklaşık ' + km(e.mesafe);
      alt.push('Ortalama ' + sayi(e.ort) + ' km/sa' + (e.maks ? ', en yüksek ' + sayi(e.maks.hiz) + ' km/sa (' + saat(e.maks.t) + ')' : '') + '.');
      if (e.kisa.length) {
        alt.push(e.kisa.length + ' kısa duraklama: ' + e.kisa.slice(0, 8).map(function (k) {
          return saat(k.t0) + ' (' + sure(k.t1 - k.t0) + ') ' + dugme(konumHedef(k.konum, 'Kısa duraklama ' + saat(k.t0)), '📍');
        }).join(', ') + (e.kisa.length > 8 ? ' ve ' + (e.kisa.length - 8) + ' tane daha.' : ''));
      }
      if (e.ilkVeri) alt.push('Analiz edilen veri bu yolculuğun içinde başlıyor; öncesi bilinmiyor.');
      hedef = { nokta: e.nokta, etiket: 'Yolculuk ' + aralik };
    } else if (tur === 'bekle') {
      baslik = sure(s) + (s < 60e3 ? ' durdu' : ' bekledi') + (e.yer ? ' · ' + e.yer : '');
      if (e.tamSure >= Analiz.ayar.UZUN_BEKLEME) {
        ekCip = cip('uzun bekleme', 'uy');
        alt.push('Bu aralıkta araç neredeyse hiç hareket etmedi' + (e.yayilim !== null ? ' (konum yayılımı en çok ' + metre(e.yayilim) + ')' : '') + '.');
      }
      if (sonraki && sonraki.tur === 'yol') alt.push('Ardından yola devam etti.');
      hedef = konumHedef(e.konum, 'Bekleme ' + aralik + ' (' + sure(s) + ')');
    } else {
      baslik = (tur === 'gps' ? 'GPS alınamadı · ' : 'Veri yok · ') + sure(s) + (e.yer ? ' · ' + e.yer : '');
      if (e.fark === null) alt.push('Sonrasında henüz konum kaydı yok; aracın durumu bilinmiyor.');
      else if (e.fark <= Analiz.ayar.YER_YARICAP) {
        alt.push('Öncesi ve sonrasındaki konum yaklaşık ' + metre(e.fark) + ' arayla: araç büyük olasılıkla aynı yerde bekliyordu. Arada hareket edip döndüğü ihtimali doğrulanamaz.');
      } else alt.push('Sonraki konum ' + metre(e.fark) + ' uzakta: araç bu sürede yer değiştirmiş. Rota ve mesafe bilinmediği için toplamlara eklenmedi.');
      hedef = konumHedef(e.konum, (tur === 'gps' ? 'GPS alınamadı ' : 'Veri yok ') + aralik);
    }
    if (e.oncedenSuruyor || e.sonraSuruyor) {
      alt.push((e.oncedenSuruyor ? 'Önceki günden sürüyor' : 'Sonraki güne devam ediyor') + (e.oncedenSuruyor && e.sonraSuruyor ? ', sonraki güne de devam ediyor' : '') + ' (toplam ' + sure(e.tamSure) + ').');
    }
    return '<li class="az-olay az-' + tur + '"><div class="az-saat">' + aralik + '</div><div class="az-metin"><div class="az-olay-bas"><b>' + baslik + '</b>' + ekCip + dugme(hedef) + '</div>' +
      (alt.length ? '<p>' + alt.join(' ') + '</p>' : '') + '</div></li>';
  }

  function seritHtml(g) {
    var ad = { yol: 'Yolculuk', bekle: 'Bekleme', gps: 'GPS yok', yok: 'Veri yok' };
    return '<div class="az-serit" aria-hidden="true">' + g.olaylar.map(function (e) {
      return '<i class="az-' + e.tur + '" style="left:' + ((e.t0 - g.bas) / 864e5 * 100).toFixed(3) + '%;width:' + Math.max(.25, (e.t1 - e.t0) / 864e5 * 100).toFixed(3) + '%" title="' + ad[e.tur] + ' ' + saat(e.t0) + ' – ' + bitisSaat(e.t1, g.bas) + '"></i>';
    }).join('') + '</div><div class="az-olcek" aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>';
  }

  function gunGovde(c, g) {
    var ol = g.olaylar.map(function (e, i) { return olayHtml(c, g, e, g.olaylar[i + 1]); }).join('');
    return '<p class="az-ozet-metin">' + esc(gunCumleleri(c, g)) + '</p>' + seritHtml(g) +
      (ol ? '<ol class="az-olaylar">' + ol + '</ol>' : '<p class="not">Bu günde yalnızca tek kayıt var; süre hesaplanamıyor.</p>');
  }

  function gunBaslik(g) {
    var o = g.ozet;
    return '<span class="az-gun-ad">' + esc(gunAd(g.bas)) + '</span><span class="az-cipler">' +
      cip(o.yolculuk + ' yolculuk') + (o.yolculuk ? cip(km(o.mesafe)) + cip(sure(o.surus) + ' sürüş') : '') +
      (o.bekleme ? cip(sure(o.bekleme) + ' bekleme') : '') + (o.gps ? cip(sure(o.gps) + ' GPS yok', 'uy') : '') + (o.veriYok ? cip(sure(o.veriYok) + ' veri yok', 'uy') : '') + '</span>';
  }

  /* ---------- Cihaz geneli ---------- */
  function bolum(ad, icerik) { return '<div class="az-bolum"><h4>' + ad + '</h4>' + icerik + '</div>'; }

  function yerlerHtml(c) {
    if (!c.yerler.length) return '';
    var Y = c.yerler.slice().sort(function (a, b) { return (b.sure + b.belirsizSure) - (a.sure + a.belirsizSure); });
    return bolum('Durulan yerler', '<ul>' + Y.slice(0, 15).map(function (y) {
      return '<li><b>' + y.ad + '</b> · ' + y.adet + ' kez' + (y.sure ? ' · ' + sure(y.sure) + ' bekleme' : '') + (y.belirsizSure ? ' · ' + sure(y.belirsizSure) + ' belirsiz (büyük olasılıkla burada)' : '') + ' ' +
        dugme(konumHedef(y, c.ad + ' ' + y.ad)) + '</li>';
    }).join('') + '</ul>' + (Y.length > 15 ? '<p class="not">' + (Y.length - 15) + ' yer daha var (en uzun süreli 15 tanesi listelendi).</p>' : ''));
  }

  function hizHtml(c) {
    var H = c.hiz;
    if (!H.length) return bolum('Hız', '<p>' + hizSinir + ' km/sa üstünde kayıt yok' + (c.toplam.maks ? ' (en yüksek ' + sayi(c.toplam.maks.hiz) + ' km/sa)' : '') + '.</p>');
    return bolum('Hız · ' + hizSinir + ' km/sa üstü', '<ul>' + H.slice(0, 30).map(function (x) {
      return '<li>' + kisaTarih(x.t0) + (x.t1 > x.t0 ? ' – ' + saat(x.t1) : '') + ' · en yüksek <b>' + sayi(x.maks) + ' km/sa</b> ' + dugme(x.nokta.length > 1 ? { nokta: x.nokta, etiket: 'Hız ' + kisaTarih(x.t0) } : konumHedef(x.konum, 'Hız ' + kisaTarih(x.t0))) + '</li>';
    }).join('') + '</ul>' + (H.length > 30 ? '<p class="not">' + (H.length - 30) + ' bölüm daha var.</p>' : '') +
      '<p class="not">Hız ~15 sn arayla ölçülür; gerçek en yüksek hız daha fazla olabilir. Yolun yasal sınırı bilinmez.</p>');
  }

  function kontakHtml(c) {
    var k = c.kontak;
    if (!k.belirlenebilir) {
      return bolum('Kontak / şarj', '<p><b>Belirlenemedi.</b> ' + (k.hep ? 'Bu aralıkta şarj durumu hiç değişmedi (hep “' + k.hep + '”); ' : 'Şarj bilgisi yok; ') +
        'bu yüzden kontak veya rölanti sonucu çıkarılmadı.</p>');
    }
    var ic = '<p class="not">Telefonun şarjı kontağa bağlı bir girişten besleniyorsa geçerlidir.</p>';
    if (k.olaylar.length) {
      ic += '<ul>' + k.olaylar.slice(0, 30).map(function (o) {
        return '<li>' + kisaTarih(o.t) + ' · ' + (o.tip === 'SARJ_BASLADI' ? 'Şarj başladı (kontak açıldı)' : 'Şarj kesildi (kontak kapandı)') + ' ' + dugme(konumHedef(o.konum, 'Kontak ' + kisaTarih(o.t))) + '</li>';
      }).join('') + '</ul>' + (k.olaylar.length > 30 ? '<p class="not">' + (k.olaylar.length - 30) + ' olay daha var.</p>' : '');
    }
    ic += k.rolanti.length ? '<p><b>Kontak açık görünürken bekleme (olası rölanti):</b></p><ul>' + k.rolanti.slice(0, 30).map(function (r) {
      return '<li>' + kisaTarih(r.t0) + ' – ' + saat(r.t1) + ' · ' + sure(r.t1 - r.t0) + (r.yer ? ' · ' + r.yer : '') + ' ' + dugme(konumHedef(r.konum, 'Olası rölanti ' + kisaTarih(r.t0))) + '</li>';
    }).join('') + '</ul>' : '<p>5 dakikadan uzun, kontak açık bekleme görülmedi.</p>';
    return bolum('Kontak / şarj', ic);
  }

  function saglikHtml(c) {
    var s = c.saglik, L = [];
    if (s.pilIlk !== null) L.push('Pil: %' + s.pilIlk + ' → %' + s.pilSon + ' (en düşük %' + s.pilMin + ')' + (s.sarjdaDusus ? '. <b>Şarjdayken pil düşmüş: besleme yetersiz olabilir.</b>' : ''));
    if (s.sicMaks) L.push('En yüksek pil sıcaklığı: ' + sayi(s.sicMaks.deger, 1) + ' °C (' + kisaTarih(s.sicMaks.t) + ')' + (s.isinma || s.kritik ? ' · <b>' + s.isinma + ' ısınma, ' + s.kritik + ' kritik ısınma kaydı</b>' : ' · ısınma kaydı yok'));
    if (s.accOrtanca !== null) L.push('GPS doğruluğu: ortanca ' + sayi(s.accOrtanca) + ' m' + (s.zayifKonum ? ' · ' + s.zayifKonum + ' kayıtta 50 m’den kötü' : ''));
    L.push('GPS alınamadı kaydı: ' + s.konumYok + ' · uzun GPS’siz dönem: ' + s.gpsDonem + ' · kayıtsız dönem: ' + s.veriYokDonem);
    if (s.gecikmeOrtanca !== null) L.push('Sunucuya ulaşma gecikmesi: ortanca ' + sure(s.gecikmeOrtanca) + ', en uzun ' + sure(s.gecikmeMaks));
    return bolum('Cihaz ve veri durumu', '<ul>' + L.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>');
  }

  function cihazHtml(c, i, adet) {
    var t = c.toplam;
    var sonNot = 'Son kayıt ' + kisaTarih(c.son) + (c.sonHareketli ? ' (araç hareketli görünüyordu)' : '') + '. Sonrası için kayıt yok; yeni kayıtlar telefonda bekliyor olabilir.';
    return '<details class="az-cihaz"' + (adet <= 3 || i === 0 ? ' open' : '') + '><summary><span class="az-cihaz-ad">' + esc(c.ad) + '</span><span class="az-cipler">' +
      cip(sayi(c.kayitSayisi) + ' kayıt') + cip(t.yolculuk + ' yolculuk') + (t.yolculuk ? cip(km(t.mesafe)) + cip(sure(t.surus) + ' sürüş') : '') + (t.maks ? cip('en yüksek ' + sayi(t.maks.hiz) + ' km/sa') : '') + '</span></summary>' +
      '<div class="az-cihaz-govde"><p class="az-son">' + esc(sonNot) + ' ' + dugme(konumHedef(c.sonKonum, c.ad + ' son konum')) + '</p>' +
      c.gunler.map(function (g, n) {
        var acik = n === c.gunler.length - 1;
        return '<details class="az-gun" data-cihaz="' + i + '" data-gun="' + n + '"' + (acik ? ' open' : '') + '><summary>' + gunBaslik(g) + '</summary><div class="az-gun-govde">' + (acik ? gunGovde(c, g) : '') + '</div></details>';
      }).join('') +
      yerlerHtml(c) + hizHtml(c) + kontakHtml(c) + saglikHtml(c) + '</div></details>';
  }

  function ciz() {
    hedefler = [];
    sonuc = Analiz.coz(kayitlar, { hizSinir: hizSinir });
    $('az-icerik').innerHTML = sonuc.map(function (c, i) { return cihazHtml(c, i, sonuc.length); }).join('') +
      '<p class="not">Sonuçlar kayıtlardan kurallarla çıkarılır; süre ve mesafeler yaklaşıktır. Duruş saati, 2 dakika gecikmeli yazılan “araç durdu” kaydından geriye doğru düzeltilir. Bekleme nedeni ve sürücü bilinemez. “Yer A, B…” adları her cihaz için ayrıdır.</p>';
  }

  /* ---------- Veri ---------- */
  function durumYaz(yazi, tur) {
    var d = $('az-durum');
    d.hidden = !yazi;
    d.className = 'az-durum' + (tur ? ' ' + tur : '');
    d.innerHTML = yazi ? (tur ? '' : '<span class="yk-halka" aria-hidden="true"></span>') + '<span>' + yazi + '</span>' : '';
  }

  function filtreUyarisi(q) {
    var ad = [];
    [['tip', 'Log tipi'], ['hareket', 'Araç'], ['sarj', 'Şarj/kontak'], ['pilMin', 'Pil'], ['pilMax', 'Pil'], ['sicMin', 'Pil sıcaklığı'], ['sicMax', 'Pil sıcaklığı'], ['dogMax', 'Doğruluk'], ['konumlu', 'Yalnızca konumlu']].forEach(function (f) {
      if (q.get(f[0]) && ad.indexOf(f[1]) < 0) ad.push(f[1]);
    });
    var u = $('az-uyari');
    u.hidden = !ad.length;
    u.textContent = ad.length ? 'Dikkat: ' + ad.join(', ') + ' filtresi kayıtların bir kısmını gizliyor. Yolculuk, bekleme ve GPS sonuçları eksik ya da yanlış olabilir. En doğru sonuç için yalnızca tarih ve cihaz filtresi kullanın.' : '';
  }

  function getir(q, mod, sinyal) {
    q.set('analiz', mod);
    return fetch('/emeklirobot/api.php?' + q.toString(), { credentials: 'same-origin', cache: 'no-store', signal: sinyal })
      .then(function (r) { if (r.status === 401) { location.reload(); throw new Error('oturum'); } return r.json(); })
      .then(function (v) { if (!v.ok || typeof v.toplam !== 'number') throw new Error('sunucu'); return v; });
  }

  function sinirMesaji(v) {
    durumYaz('Bu filtre <b>' + sayi(v.toplam) + '</b> kayıt döndürüyor; analiz sınırı <b>' + sayi(v.sinir) + '</b> kayıt. Lütfen filtreyi daraltın (daha kısa tarih aralığı ya da tek cihaz seçin).', 'uyari');
  }

  function analizEt() {
    var no = ++istekNo, q = new URLSearchParams(sorgu()), sure_ = null;
    if (iptal) iptal.abort();
    iptal = window.AbortController ? new AbortController() : null;
    var sinyal = iptal ? iptal.signal : undefined;
    sure_ = iptal ? setTimeout(function (c) { c.abort(); }, 60000, iptal) : null;
    q.delete('limit'); q.delete('secenek');
    kayitlar = null; sonuc = null;
    haritaTemizle();
    $('az-icerik').innerHTML = ''; $('az-kapsam').textContent = '';
    filtreUyarisi(q);
    $('azmodal').hidden = false;
    durumYaz('Filtreye uyan kayıt sayısı hesaplanıyor…');
    // Önce yalnızca sayılır: sınırın üstündeyse veri hiç çekilmez
    getir(q, 'say', sinyal).then(function (v) {
      if (no !== istekNo) return null;
      if (!v.toplam) { durumYaz('Bu filtreye uyan kayıt yok.', 'uyari'); return null; }
      if (v.toplam > v.sinir) { sinirMesaji(v); return null; }
      durumYaz(sayi(v.toplam) + ' kayıt alınıp analiz ediliyor…');
      return getir(q, 'veri', sinyal);
    }).then(function (v) {
      if (!v || no !== istekNo) return;
      if (!v.satirlar) { sinirMesaji(v); return; }
      kayitlar = v.satirlar.map(function (r) { // sıra: api.php analiz=veri
        return { cihaz: r[0], tip: r[1], t: r[2] * 1000, lat: r[3], lon: r[4], acc: r[5], hiz: r[6], pil: r[7], sarj: r[8] === null ? null : r[8] === 1, sic: r[9], har: r[10] === null ? null : r[10] === 1, alinma: r[11] * 1000 };
      });
      if (!kayitlar.length) { durumYaz('Bu filtreye uyan kayıt yok.', 'uyari'); return; }
      ciz();
      $('az-kapsam').textContent = sayi(kayitlar.length) + ' kayıt · ' + sonuc.length + ' cihaz · ' + kisaTarih(kayitlar[0].t) + ' – ' + kisaTarih(kayitlar[kayitlar.length - 1].t);
      durumYaz('');
    }).catch(function (e) {
      if (no !== istekNo || (e && e.message === 'oturum')) return;
      durumYaz('Analiz verisi alınamadı. Tekrar deneyin.', 'uyari');
      if (window.console) console.error(e);
    }).then(function () { clearTimeout(sure_); });
  }

  function kapat() {
    $('azmodal').hidden = true;
    if (!kayitlar) { istekNo++; if (iptal) iptal.abort(); }
  }

  /* ---------- Haritada gösterme ---------- */
  function haritaTemizle() {
    if (katman) { harita.removeLayer(katman); katman = null; }
    if (donKontrol) { harita.removeControl(donKontrol); donKontrol = null; }
  }

  function haritadaGoster(h) {
    haritaTemizle();
    kaydirma = $('azmodal').querySelector('.az-kutu').scrollTop; // "Analize dön" aynı yere dönsün
    $('azmodal').hidden = true;
    katman = L.layerGroup().addTo(harita);
    var D = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'az-don');
        d.innerHTML = '<span>' + esc(h.etiket) + '</span><button type="button" data-is="don">← Analize dön</button><button type="button" data-is="sil" aria-label="İşareti kaldır" title="İşareti kaldır">×</button>';
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.on(d, 'click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          var don = b.getAttribute('data-is') === 'don';
          haritaTemizle();
          if (don) { $('azmodal').hidden = false; $('azmodal').querySelector('.az-kutu').scrollTop = kaydirma; }
        });
        return d;
      }
    });
    donKontrol = new D().addTo(harita);
    $('harita').scrollIntoView({ block: 'center' });
    harita.invalidateSize();
    if (h.nokta && h.nokta.length > 1) {
      L.polyline(h.nokta, { color: '#0f172a', weight: 9, opacity: .55, interactive: false }).addTo(katman);
      L.polyline(h.nokta, { color: '#f59e0b', weight: 5, opacity: 1, interactive: false }).addTo(katman);
      L.circleMarker(h.nokta[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).bindTooltip('Başlangıç').addTo(katman);
      L.circleMarker(h.nokta[h.nokta.length - 1], { radius: 7, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }).bindTooltip('Bitiş').addTo(katman);
      harita.fitBounds(h.nokta, { maxZoom: 17, padding: [40, 40] });
    } else {
      var k = h.konum || h.nokta[0];
      L.circle(k, { radius: 40, color: '#f59e0b', weight: 2, fillOpacity: .2, interactive: false }).addTo(katman);
      L.circleMarker(k, { radius: 9, color: '#0f172a', weight: 3, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(katman);
      harita.setView(k, 17);
    }
  }

  function baslat(secenek) {
    harita = secenek.harita; sorgu = secenek.sorgu;
    $('az-hiz').value = hizSinir;
    $('b-analiz').addEventListener('click', analizEt);
    $('azkapat').addEventListener('click', kapat);
    $('azmodal').addEventListener('mousedown', function (e) { if (e.target === this) kapat(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('azmodal').hidden) kapat(); });
    $('az-hiz').addEventListener('change', function () {
      var n = Math.round(Number(this.value));
      if (!(n >= 10 && n <= 300)) { this.value = hizSinir; return; }
      hizSinir = n; this.value = n;
      try { localStorage.setItem('er_hiz_sinir', String(n)); } catch (e) {}
      if (kayitlar && kayitlar.length) ciz();
    });
    $('az-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('.az-git');
      if (b) { e.preventDefault(); haritadaGoster(hedefler[Number(b.getAttribute('data-hedef'))]); }
    });
    // Kapalı günlerin içeriği ilk açılışta oluşturulur (uzun aralıklarda sayfa ağırlaşmasın). "toggle" yukarı taşınmaz: yakalama aşaması.
    $('az-icerik').addEventListener('toggle', function (e) {
      var d = e.target;
      if (!d.classList.contains('az-gun') || !d.open) return;
      var govde = d.querySelector('.az-gun-govde');
      if (govde.firstChild) return;
      var c = sonuc[Number(d.getAttribute('data-cihaz'))];
      govde.innerHTML = gunGovde(c, c.gunler[Number(d.getAttribute('data-gun'))]);
    }, true);
  }

  window.AnalizUI = { baslat: baslat };
})();
