/* "Buraya ne zaman gittim?": haritada seçilen noktanın çevresinde kaydedilmiş duruşlar.
   Kaynak: günlük özetlerdeki duraklar (ham loglar silinse de kalır). Durmadan yapılan geçişler listelenmez. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi, sure = O.sure;
  var SATIR = 200;
  var harita = null, dugme = null, kontrol = null, nokta = null, veri = null, liste = [], no = 0;

  function mesaj(t) { $('nz-mesaj').textContent = t || ''; }

  /* ---------- Haritadan nokta seçme ---------- */
  function secimBitir() {
    if (!kontrol) return;
    harita.off('click', haritaTik);
    harita.removeControl(kontrol); kontrol = null;
    $('harita').classList.remove('nz-sec');
    dugmeDurumu();
  }
  function dugmeDurumu() { dugme.classList.toggle('acik', !!kontrol); dugme.setAttribute('aria-pressed', kontrol ? 'true' : 'false'); }
  // Haritanın solunda, "ortala"nın altında: üzerinde soru işareti olan konum iğnesi
  function dugmeEkle() {
    var Kontrol = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var b = L.DomUtil.create('button', 'ortala-btn nz-btn leaflet-bar');
        b.type = 'button'; b.title = 'Buraya ne zaman gittim?'; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5a8.5 8.5 0 0 0-8.5 8.5c0 5.9 8.5 12.5 8.5 12.5s8.500-6.6 8.500-12.500A8.500 8.500 0 0 0 12 1.500z"/><path class="nz-soru" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9.300 7.900a2.700 2.700 0 1 1 3.900 2.400c-.8.400-1.2 1-1.200 1.900"/><circle class="nz-nokta" cx="12" cy="15.400" r="1.250"/></svg>';
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', function () { if (kontrol) secimBitir(); else sec(); }); // ikinci basış seçimi kapatır
        return b;
      }
    });
    dugme = new Kontrol().addTo(harita).getContainer();
  }
  function haritaTik(e) { secildi(e.latlng.lat, ((e.latlng.lng + 540) % 360) - 180); }
  function sec(veriKalsin) {
    if (!$('yerpanel').hidden) { $('yp-mesaj').textContent = 'Önce konum kaydetme penceresini kapatın.'; return; }
    secimBitir();
    if (veriKalsin !== true) { no++; veri = null; }
    O.pencereleriGizle();
    O.haritaTemizle();
    var Kutu = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'az-don');
        d.innerHTML = '<span>Merak ettiğiniz yere haritada tıklayın</span><div class="nz-koord"><input id="nz-koord" maxlength="80" placeholder="ya da enlem, boylam" aria-label="Koordinat (enlem, boylam)" autocomplete="off"><button type="button" data-is="git">Bak</button></div>' +
          '<small class="nz-hata" role="status"></small><button type="button" data-is="vazgec">Vazgeç</button>';
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.disableScrollPropagation(d);
        function koordBak() {
          var p = Yerler.koordAyir(d.querySelector('input').value);
          if (p) secildi(p[0], p[1]); else d.querySelector('.nz-hata').textContent = 'Koordinat okunamadı. Örnek: 41.1144876, 28.5647841';
        }
        L.DomEvent.on(d, 'click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.getAttribute('data-is') === 'git') koordBak(); else secimBitir();
        });
        L.DomEvent.on(d, 'keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') koordBak(); });
        return d;
      }
    });
    kontrol = new Kutu().addTo(harita);
    $('harita').classList.add('nz-sec');
    $('harita').scrollIntoView({ block: 'center' });
    harita.invalidateSize();
    harita.on('click', haritaTik);
    dugmeDurumu();
  }

  /* ---------- Sonuçlar ---------- */
  function secildi(lat, lon) {
    secimBitir();
    nokta = { lat: lat, lon: lon };
    $('nzmodal').hidden = false;
    $('nzmodal').querySelector('.modal-kutu').scrollTop = 0;
    if (veri) { ciz(); return; }
    var n = ++no;
    $('nz-icerik').innerHTML = '';
    mesaj('Geçmiş taranıyor…');
    Yerler.hazir().then(function () { return Rapor.senkron(function (t) { if (n === no) mesaj(t); }); }).then(function (s) {
      var secili = $('nz-cihaz').value;
      $('nz-cihaz').innerHTML = '<option value="">Tüm cihazlar</option>' + s.cihazlar.map(function (c) { return '<option' + (c === secili ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      return Rapor.veriAl('2000-01-01', O.istGun(Date.now()), '').then(function (v) {
        if (n !== no) return;
        veri = v; veri.atlanan = s.atlanan;
        ciz();
      });
    }).catch(function (e) { if (n === no) mesaj(O.hataMetni(e)); });
  }

  function bul() {
    var r = Number($('nz-yaricap').value), cihaz = $('nz-cihaz').value;
    // Çevredeki bütün duraklar tek "yer" sayılır; ardışık olanlar Ziyaretler sekmesiyle aynı kuralla birleşir
    var tek = { anahtar: 'nz', ad: 'Seçilen nokta', kayitli: false };
    var D = veri.tumDurak.filter(function (d) { return (!cihaz || d.cihaz === cihaz) && Analiz.mesafe(nokta, d) <= r; }).map(function (d) {
      return { cihaz: d.cihaz, gun: d.gun, t0: d.t0, t1: d.t1, belirsiz: d.belirsiz, yer: tek };
    });
    return RaporEk.ziyaretler({ tumDurak: D, tumYol: veri.tumYol, d: veri.d }).sort(function (a, b) { return b.t0 - a.t0; });
  }

  function ciz() {
    if (!veri || !nokta) return;
    liste = bul();
    var notlar = [];
    if (veri.kesildi) notlar.push('Geçmiş çok uzun olduğu için en yeni günlerin bir kısmı taranamamış olabilir.');
    if (veri.atlanan && veri.atlanan.length) notlar.push('Çok yoğun olduğu için hesaplanamayan günler var: ' + veri.atlanan.join(', '));
    mesaj(notlar.join(' '));
    var kayitli = Yerler.bul(nokta.lat, nokta.lon);
    var html = '<p>' + (kayitli ? Yerler.ikon(kayitli.yer.tur) + ' <b>' + esc(kayitli.ad) + '</b> · ' : '') + '<span class="sayac">' + nokta.lat.toFixed(6) + ', ' + nokta.lon.toFixed(6) + '</span></p>' +
      '<p><button type="button" class="az-git" data-nz="harita">Haritada göster</button> <button type="button" class="az-git" data-nz="baska">Başka nokta seç</button>' +
      (kayitli ? '' : ' <button type="button" class="az-git" data-nz="kaydet">Konumu kaydet</button>') + '</p>';
    if (!liste.length) {
      html += '<p><b>Bu çevrede kayıtlı bir duruş bulunamadı.</b> Yarıçapı büyütmeyi deneyin.</p>';
    } else {
      var gunler = {}, toplam = 0;
      liste.forEach(function (z) { gunler[O.istGun(z.t0)] = 1; toplam += z.t1 - z.t0; });
      var ilk = liste[liste.length - 1];
      html += '<div class="rp-kartlar">' + [['Kaç kez', sayi(liste.length), Object.keys(gunler).length + ' farklı gün'], ['Toplam kalış', sure(toplam), 'her seferinde ortalama ' + sure(toplam / liste.length)],
        ['Son gidiş', O.kisaTarih(liste[0].t0), ''], ['İlk kayıt', O.kisaTarih(ilk.t0), '']].map(function (k) { return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong><small>' + k[2] + '</small></div>'; }).join('') + '</div>' +
        Rapor.ic.tablo(['Varış', 'Ayrılış', 'Kalış', 'Cihaz', 'Not', ''], liste.slice(0, SATIR).map(function (z, i) {
          return [(z.varisBelli ? '' : '≤ ') + tarihli(z.t0), (z.cikisBelli ? '' : '≥ ') + tarihli(z.t1), sure(z.t1 - z.t0), esc(z.cihaz), z.belirsiz ? 'GPS’siz ' + sure(z.belirsiz) : '',
            '<button type="button" class="az-git" data-nz="gun" data-i="' + i + '">▶ Günü göster</button>'];
        })) + (liste.length > SATIR ? '<p class="not">En yeni ' + SATIR + ' kayıt gösteriliyor; Excel tümünü içerir.</p>' : '');
    }
    html += '<p class="not">Yalnızca en az 1 dakikalık duruşlar listelenir; durmadan yapılan geçişler görünmez. Yıl dahil tüm geçmiş taranır. “≤ / ≥”: varış ya da ayrılış anı kesin bilinmiyor. “GPS’siz” süre, telefonun büyük olasılıkla orada olduğu süredir. “Günü göster” için o günün ham kayıtları gerekir.</p>';
    $('nz-icerik').innerHTML = html;
  }
  // Tüm geçmiş tarandığı için yıl da yazılır
  function tarihli(t) { return Rapor.ic.gunYaz(O.istGun(t)) + ' ' + O.saat(t); }

  function baslat(h) {
    harita = h;
    dugmeEkle();
    O.pencere('nzmodal', 'nzkapat', function () { no++; veri = null; }); // yeniden açınca güncel veri alınır
    $('nz-yaricap').addEventListener('change', ciz);
    $('nz-cihaz').addEventListener('change', ciz);
    $('nz-excel').addEventListener('click', function () {
      if (!veri || !liste.length) { mesaj('İndirilecek kayıt yok.'); return; }
      Rapor.ic.indir(['Varış', 'Ayrılış', 'Kalış (dk)', 'GPS’siz (dk)', 'Cihaz', 'Varış kesin', 'Ayrılış kesin'], liste.slice().reverse().map(function (z) {
        return [new Date(z.t0), new Date(z.t1), Math.round((z.t1 - z.t0) / 60e3), Math.round(z.belirsiz / 60e3), z.cihaz, z.varisBelli ? 'Evet' : 'Hayır', z.cikisBelli ? 'Evet' : 'Hayır'];
      }), [20, 20, 12, 13, 16, 12, 13], 'Buraya-ne-zaman', { bas: O.istGun(liste[liste.length - 1].t0), bit: O.istGun(liste[0].t0) });
    });
    $('nz-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var is = b.getAttribute('data-nz');
      if (is === 'baska') { $('nzmodal').hidden = true; sec(true); }
      else if (is === 'kaydet') Yerler.duzenle({ lat: nokta.lat, lon: nokta.lon });
      else if (is === 'harita') {
        var k = [nokta.lat, nokta.lon], r = Number($('nz-yaricap').value);
        O.haritadaGoster({ etiket: 'Seçilen nokta · ' + O.metre(r) + ' çevre', daginik: [], daire: { konum: k, yaricap: r }, duraklar: [{ no: '★', konum: k, etiket: 'Seçilen nokta' }] });
      } else if (is === 'gun') {
        var z = liste[Number(b.getAttribute('data-i'))];
        RaporEk.hikayeOynat(z.cihaz, O.istGun(z.t0), mesaj);
      }
    });
    Yerler.degisince(function () { if (!$('nzmodal').hidden) ciz(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') secimBitir(); });
    // Başka bir araç açılınca seçim kipi kapanır (tıklama yanlışlıkla sonuç penceresi açmasın)
    document.querySelector('.arac-cubugu').addEventListener('click', secimBitir, true);
  }

  window.NeZaman = { baslat: baslat, sec: sec };
})();
