/* Veritabanı Yönetimi penceresi: genel bakış, tablo inceleme, temizlik (saklama kuralı dahil), yedek, işlem geçmişi, risk rehberi.
   Silinebilecek tablo ve kurallar sunucudaki sabit listeden gelir (db.php); korumalı tablolar için sunucu da reddeder. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = window.Ortak, esc = O.esc, sayi = O.sayi;
  var bilgi = null, ayarlar = {}, sekme = 'genel', mesgul = false, degisti = false, durdur = false, bekleyen = null, no = 0;

  function bayt(n) {
    if (n < 1024) return n + ' B';
    var b = ['KB', 'MB', 'GB', 'TB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < b.length - 1);
    return sayi(n, n >= 100 ? 0 : n >= 10 ? 1 : 2) + ' ' + b[i];
  }
  function tarih(iso) { return iso ? O.kisaTarih(Date.parse(iso)) : '—'; }
  function mesaj(t, tur) { var m = $('db-mesaj'); m.textContent = t || ''; m.className = 'mesaj' + (tur ? ' ' + tur : ''); }
  function db(url, govde) { return O.istek('/emeklirobot/db.php' + url, govde); }
  function tabloBilgi(ad) { for (var i = 0; i < bilgi.tablolar.length; i++) if (bilgi.tablolar[i].tablo === ad) return bilgi.tablolar[i]; return null; }
  function tablo(basliklar, satirlar) {
    return '<div class="rp-tablo"><table><thead><tr>' + basliklar.map(function (b) { return '<th>' + b + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (satirlar.length ? satirlar.map(function (s) { return '<tr>' + s.map(function (h) { return '<td>' + h + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + basliklar.length + '">Kayıt yok.</td></tr>') + '</tbody></table></div>';
  }
  function bolum(baslik, icerik) { return '<div class="az-bolum"><h4>' + baslik + '</h4>' + icerik + '</div>'; }

  /* ---------- Yedek hatırlatıcı ---------- */
  var yedek = null; // {son, gecen, esik}
  function yedekGecikti(y) { return !!y && y.esik > 0 && (y.gecen === null || y.gecen >= y.esik); }
  function yedekMetni(y) {
    if (!y) return 'Yedek durumu bilinmiyor (işlem geçmişi ya da ayar tablosu yok).';
    if (y.gecen === null) return 'Kayıtlı bir tam yedek yok.';
    return 'Son tam yedek ' + (y.gecen ? y.gecen + ' gün önce' : 'son 24 saat içinde') + ' alındı (' + tarih(y.son) + ').';
  }
  function gizliMi() { try { return localStorage.getItem('er_yedek_gizle') === O.istGun(Date.now()); } catch (e) { return false; } }
  function seritCiz() {
    var goster = yedekGecikti(yedek) && !gizliMi();
    $('yedek-serit').hidden = !goster;
    if (goster) $('yedek-serit-metin').textContent = '💾 ' + yedekMetni(yedek) + (yedek.gecen === null ? ' Tüm tabloları seçip bir yedek alın.' : '');
  }
  // Pencere açıksa yalnızca durum satırı yenilenir (yedek formundaki seçimler bozulmasın)
  function yedekYenile() {
    return db('?islem=yedek_durum').then(function (v) {
      yedek = v.yedek;
      if (bilgi) bilgi.yedek = yedek;
      if ($('db-yedek-durum')) { $('db-yedek-durum').textContent = yedekMetni(yedek); $('db-yedek-durum').parentNode.className = yedekGecikti(yedek) ? 'az-uyari' : ''; }
      seritCiz();
    }, function () {});
  }
  function yedekDurumHtml() {
    var y = bilgi.yedek;
    return bolum('Yedek durumu', '<p class="' + (yedekGecikti(y) ? 'az-uyari' : '') + '"><b id="db-yedek-durum">' + esc(yedekMetni(y)) + '</b></p>' +
      (y ? '<p><label>Hatırlatma <select id="db-yedek-gun">' + [0, 7, 14, 30, 60, 90].concat([0, 7, 14, 30, 60, 90].indexOf(y.esik) < 0 ? [y.esik] : []).map(function (g) {
        return '<option value="' + g + '"' + (g === y.esik ? ' selected' : '') + '>' + (g ? g + ' günde bir' : 'Kapalı') + '</option>';
      }).join('') + '</select></label></p>' : '') +
      '<p class="not">Yalnızca bütün tablolar seçiliyken ve tarih aralığı boşken alınan yedek “tam yedek” sayılır. Panel dosyanın bilgisayarınıza kaydedildiğini göremez; sunucunun onu sonuna kadar gönderdiğini kaydeder. Yedeğin yerinde olduğunu yine kontrol edin.</p>');
  }

  /* ---------- Riskler ---------- */
  var RISK = {
    emekli_log: 'Harita, tablo, “Analiz et” ve yolculuk tekrar oynatma bu günleri artık gösteremez. Telefon gönderdiği kaydı sildiği için kayıtlar geri gelmez. Rapor özetleri korunur (silmeden önce otomatik hesaplanır).',
    emekli_gun: 'Yolculuk listesi, rapor, ziyaretler, karne ve bakım km hesabı bu günleri kaybeder. Ham logu duran günler yeniden hesaplanabilir; logu silinmiş günler KALICI olarak gider.',
    emekli_yolculuk_etiket: 'Elle verilen İş/Özel etiketleri ve notlar gider. İş yolu masraf dökümü ve karne değişir. Otomatik kurallar etkisini sürdürür.',
    emekli_masraf: 'Harcama geçmişi, km başı maliyet ve yakıt tüketimi hesabı gider. Başka kopyası yoktur.',
    emekli_darbe: 'Telefonlar eski olayları kendileri siler (50 olay sınırı) ve gönderdiklerini normalde yeniden göndermez; silinen darbe adaylarının sunucuda başka kopyası olmayabilir.',
    emekli_bakim: 'Bakım hatırlatıcıları ve son yapılma bilgileri gider; uyarılar çıkmaz.',
    emekli_arac: 'Girilen gösterge km’leri gider; kilometre tahmini ve km’ye bağlı bakım uyarıları çalışmaz.',
    emekli_komut: 'Sonuçlanmış istekleri silmek güvenlidir. Bekleyenler silinirse telefondan beklenen anlık durum gelmeyebilir.',
    cihaz_anlik: 'Cihazın son anlık durumu görünmez olur; yeni bir “Anlık Durum” isteğiyle yeniden oluşur. Risk düşüktür.'
  };
  var RISK_SATIR = [
    ['Eski logları silmek', 'O günlerin rotası, tablosu ve ayrıntılı analizi gider.', 'Geri alınamaz (yedek varsa geri yüklenir)', 'Önce yedek alın. Panel silmeden önce günlük özetleri hesaplar.'],
    ['Bugünün loglarını silmek', 'Süren yolculuk ve beklemeler yarım görünür; son durum kartı yanılır.', 'Geri alınamaz', 'Yalnızca deneme kayıtlarını temizlemek için kullanın.'],
    ['TÜM logları silmek', 'Harita ve analiz boşalır.', 'Geri alınamaz', 'Mutlaka yedek alın.'],
    ['Rapor özetlerini silmek', 'Logu silinmiş günlerin yolculukları, raporu ve bakım km katkısı yok olur.', 'Logu olan günler yeniden hesaplanır; diğerleri kalıcı', 'Gerekmedikçe silmeyin; çok az yer kaplar.'],
    ['Yolculuk defteri / masraf silmek', 'Elle girdiğiniz bilgiler gider.', 'Geri alınamaz', 'Excel çıktısı ya da yedek alın.'],
    ['OPTIMIZE (alan geri kazanma)', 'İşlem sürerken tablo kısa süre kilitlenir; telefonun gönderimi hata alıp yeniden denenebilir.', 'Veri silmez', 'Güvenlidir; tekrar gönderimde kayıt çiftlenmez.'],
    ['Yedek indirmek', 'Dosya tüm konum geçmişinizi içerir; başkasının eline geçerse nerede olduğunuz görünür.', '—', 'Şifreli diskte saklayın, e-posta ile göndermeyin, eskileri silin.'],
    ['Yedeği geri yüklemek', 'Yalnızca eksik satırlar eklenir; var olanlar değişmez. Yanlış veritabanına aktarırsanız veriler karışabilir.', 'Eklenen satırlar elle silinir', 'phpMyAdmin’de doğru veritabanını seçtiğinizi kontrol edin.'],
    ['phpMyAdmin’de elle silmek / DROP', 'Panelin korumaları orada geçerli değildir; yerler ve tüm geçmiş silinebilir.', 'Yalnızca yedekle', 'Silme işlerini buradan yapın.'],
    ['Veritabanı şifresini değiştirmek', 'GitHub secret güncellenip yeniden deploy edilmezse panel ve telefon kayıtları durur (telefon kayıtları bekletir).', 'Düzeltilebilir', 'Önce secret’ı güncelleyin, sonra deploy edin.']
  ];

  /* ---------- Genel bakış ---------- */
  function saglik() {
    var L = [], eksik = bilgi.tablolar.filter(function (t) { return !t.var; });
    if (eksik.length) L.push(['kr', 'Eksik tablo: ' + eksik.map(function (t) { return t.tablo; }).join(', ') + '. phpMyAdmin’de ilgili SQL dosyalarını (db/2026-11-27-yerler.sql, db/2026-11-27-masraf-kural.sql, darbe adayları için db/2026-11-28-darbe.sql) çalıştırın.', '']);
    if (bilgi.ozetEksik) L.push(['uy', sayi(bilgi.ozetEksik) + ' günün rapor özeti eksik ya da eski.', '<button type="button" class="az-git" data-is="senkron">Şimdi hesapla</button>']);
    if (bilgi.saklamaAsan) L.push(['uy', 'Saklama süresini (' + bilgi.saklamaAy + ' ay) aşan ' + sayi(bilgi.saklamaAsan) + ' log var.', '<button type="button" class="az-git" data-is="saklama-temizle">İncele ve temizle</button>']);
    if (bilgi.konumsuzYer) L.push(['uy', bilgi.konumsuzYer + ' kayıtlı yerin konumu yok; analizde eşleşmez.', '<button type="button" class="az-git" data-is="yerler">Yerlerim</button>']);
    if (bilgi.takiliKomut) L.push(['uy', bilgi.takiliKomut + ' anlık durum isteği 30 dakikadan uzun süredir bekliyor (telefon çevrimdışı olabilir).', '']);
    bilgi.tablolar.forEach(function (t) {
      var toplam = t.veriBayt + t.indeksBayt;
      if (t.bosBayt > 20 * 1048576 && t.bosBayt > toplam * .2) L.push(['uy', t.ad + ': yaklaşık ' + bayt(t.bosBayt) + ' boş alan geri kazanılabilir.', '<button type="button" class="az-git" data-is="optimize" data-tablo="' + t.tablo + '">OPTIMIZE</button>']);
    });
    if (!L.length) L.push(['ok', 'Sorun görünmüyor.', '']);
    if (bilgi.yedek) L.push(yedekGecikti(bilgi.yedek) ? ['uy', yedekMetni(bilgi.yedek), '<button type="button" class="az-git" data-is="yedege-git">Yedek al</button>'] : ['ok', yedekMetni(bilgi.yedek), '']);
    return '<ul class="db-saglik">' + L.map(function (x) { return '<li class="' + x[0] + '"><span>' + esc(x[1]) + '</span>' + x[2] + '</li>'; }).join('') + '</ul>';
  }
  function genelHtml() {
    var satir = 0, boyut = 0, bos = 0;
    bilgi.tablolar.forEach(function (t) { satir += t.adet || 0; boyut += t.veriBayt + t.indeksBayt; bos += t.bosBayt; });
    bilgi.diger.forEach(function (t) { boyut += t.bayt; });
    var log = tabloBilgi('emekli_log'), tahmin = '';
    // Büyüme tahmini: son tam ayların ortalaması x satır başına ortalama bayt
    var aylar = bilgi.log.aylar.slice(1, 4);
    if (aylar.length && log.adet) {
      var ort = aylar.reduce(function (s, a) { return s + a[1]; }, 0) / aylar.length;
      tahmin = 'Son ' + aylar.length + ' tam ayın ortalaması: ayda ' + sayi(ort) + ' log ≈ ' + bayt(ort * (log.veriBayt + log.indeksBayt) / log.adet) + ' büyüme (yaklaşık).';
    }
    var en = Math.max.apply(null, bilgi.log.aylar.map(function (a) { return a[1]; }).concat([1]));
    return '<div class="rp-kartlar">' + [
      ['Veritabanı boyutu', bayt(boyut), 'boş alan ' + bayt(bos)], ['Toplam satır', sayi(satir), (bilgi.tablolar.length) + ' panel tablosu'],
      ['En eski log', tarih(bilgi.log.enEski), ''], ['En yeni log', tarih(bilgi.log.enYeni), ''], ['Sunucu', esc(String(bilgi.sunucu).split('-')[0]), 'MariaDB/MySQL']
    ].map(function (k) { return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong><small>' + k[2] + '</small></div>'; }).join('') + '</div>' +
      bolum('Sağlık denetimi', saglik()) +
      bolum('Aylara göre log sayısı', bilgi.log.aylar.length ? '<ul class="db-cubuklar">' + bilgi.log.aylar.slice().reverse().map(function (a) {
        return '<li><span>' + a[0].slice(5) + '.' + a[0].slice(0, 4) + '</span><i><b style="width:' + (a[1] / en * 100).toFixed(1) + '%"></b></i><em>' + sayi(a[1]) + '</em></li>';
      }).join('') + '</ul>' + (tahmin ? '<p class="not">' + tahmin + '</p>' : '') : '<p class="not">Log yok.</p>') +
      bolum('Cihazlara göre', tablo(['Cihaz', 'Log', 'Son kayıt'], bilgi.log.cihazlar.map(function (c) { return [esc(c[0]), sayi(c[1]), tarih(c[2])]; }))) +
      bolum('Log tipine göre', tablo(['Log tipi', 'Adet'], bilgi.log.tipler.map(function (c) { return [esc(c[0]), sayi(c[1])]; })));
  }

  /* ---------- Tablolar ---------- */
  function tablolarHtml() {
    return tablo(['Tablo', 'Satır', 'Veri + indeks', 'Boş alan', ''], bilgi.tablolar.map(function (t) {
      return ['<b>' + esc(t.ad) + '</b>' + (t.korumali ? ' <span class="az-cip">🔒 korumalı</span>' : '') + '<br><small class="db-ad">' + t.tablo + '</small>',
        t.var ? sayi(t.adet) : '<span class="az-cip kr">yok</span>', t.var ? bayt(t.veriBayt + t.indeksBayt) : '—', t.var ? bayt(t.bosBayt) : '—',
        t.var ? '<button type="button" class="az-git" data-is="incele" data-tablo="' + t.tablo + '">İncele</button>' : ''];
    })) + (bilgi.diger.length ? bolum('Panelin tanımadığı tablolar (yalnızca bilgi)', tablo(['Tablo', 'Yaklaşık satır', 'Boyut'], bilgi.diger.map(function (t) { return [esc(t.tablo), sayi(t.adet), bayt(t.bayt)]; }))) : '') +
      '<div id="db-incele"></div>';
  }
  function incele(ad) {
    var t = tabloBilgi(ad), k = $('db-incele');
    k.innerHTML = '<p class="sayac">Yükleniyor…</p>';
    db('?islem=tablo&tablo=' + ad).then(function (v) {
      if (!$('db-incele')) return;
      $('db-incele').innerHTML = '<div class="az-bolum"><h4>' + esc(t.ad) + ' · ' + ad + '</h4><p>' + esc(t.aciklama) + '</p>' +
        '<p><button type="button" class="az-git" data-is="optimize" data-tablo="' + ad + '">OPTIMIZE (alan geri kazan)</button></p>' +
        '<h4>Sütunlar</h4>' + tablo(['Sütun', 'Tip', 'Boş olabilir', 'Açıklama'], v.kolonlar.map(function (c) { return [esc(c[0]), esc(c[1]), c[2] ? 'evet' : 'hayır', esc(c[3] || '')]; })) +
        '<h4>İndeksler</h4>' + tablo(['Ad', 'Tekil', 'Sütunlar'], v.indeksler.map(function (i) { return [esc(i[0]), i[1] ? 'evet' : 'hayır', esc(i[2])]; })) +
        '<h4>Son 20 satır (salt okunur)</h4>' + tablo(v.kolonlar.map(function (c) { return esc(c[0]); }), v.satirlar.map(function (s) { return s.map(function (x) { return x === null ? '<span class="db-bos">NULL</span>' : esc(x); }); })) + '</div>';
      $('db-incele').scrollIntoView({ block: 'nearest' });
    }).catch(function (e) { if ($('db-incele')) $('db-incele').innerHTML = '<p class="az-uyari">' + esc(O.hataMetni(e)) + '</p>'; });
  }

  /* ---------- Temizlik ---------- */
  function temizlikHtml() {
    var cihazlar = bilgi.log.cihazlar.map(function (c) { return c[0]; });
    var html = '<p class="az-uyari">Silinen veriler geri getirilemez. Büyük bir temizlikten önce <button type="button" class="az-git" data-is="yedege-git">yedek alın</button>. Silmeden önce her zaman kaç satırın etkileneceği gösterilir.<br><b>' + esc(yedekMetni(bilgi.yedek)) + '</b></p>' +
      bolum('Saklama kuralı', '<p>Ham logları kaç ay saklamak istiyorsunuz? Süreyi aşan kayıt olunca “Genel bakış” uyarır; <b>silme kendiliğinden yapılmaz</b>, siz onaylarsınız.</p>' +
        '<p><select id="db-saklama">' + [0, 3, 6, 12, 24].map(function (a) { return '<option value="' + a + '"' + (a === (bilgi.saklamaAy || 0) ? ' selected' : '') + '>' + (a ? a + ' ay' : 'Sınırsız (uyarma)') + '</option>'; }).join('') + '</select> ' +
        (bilgi.saklamaAsan ? '<button type="button" class="az-git" data-is="saklama-temizle">Süreyi aşan ' + sayi(bilgi.saklamaAsan) + ' logu incele</button>' : '') + '</p>');
    html += bilgi.tablolar.filter(function (t) { return !t.korumali && t.var; }).map(function (t) {
      return '<div class="az-bolum db-temizlik" data-tablo="' + t.tablo + '"><h4>' + esc(t.ad) + ' <span class="db-adet">' + sayi(t.adet) + ' satır</span></h4><p>' + esc(t.aciklama) + '</p>' +
        '<p class="db-risk">⚠️ ' + esc(RISK[t.tablo] || '') + '</p><div class="db-satir"><select class="db-kural" aria-label="Silme seçeneği"><option value="">Silme seçeneği seçin…</option>' +
        t.kurallar.map(function (k) { return '<option value="' + k.kural + '">' + esc(k.ad) + '</option>'; }).join('') + '</select>' +
        '<span class="db-aralik" hidden><input type="date" class="db-bas" aria-label="Başlangıç günü"> – <input type="date" class="db-bit" aria-label="Bitiş günü"></span>' +
        '<select class="db-cihaz" aria-label="Cihaz" hidden>' + cihazlar.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="az-git" data-is="onizle">Kaç satır silinecek?</button></div><div class="db-onay-kutu"></div></div>';
    }).join('');
    html += bolum('🔒 Korumalı tablolar', '<p>Bu tablolar buradan <b>silinemez</b>; sunucu da silme isteğini reddeder.</p><ul>' + bilgi.tablolar.filter(function (t) { return t.korumali; }).map(function (t) {
      return '<li><b>' + esc(t.ad) + '</b> (' + t.tablo + ')' + (t.var ? ' · ' + sayi(t.adet) + ' satır' : '') + ' — ' + esc(t.aciklama) + '</li>';
    }).join('') + '</ul>');
    return html;
  }
  function parametre(kutu) {
    var k = kutu.querySelector('.db-kural').value, t = tabloBilgi(kutu.getAttribute('data-tablo')), x = null;
    t.kurallar.forEach(function (r) { if (r.kural === k) x = r; });
    if (!x) return null;
    var deger = null;
    if (x.deger === 'aralik') deger = { bas: kutu.querySelector('.db-bas').value, bit: kutu.querySelector('.db-bit').value };
    if (x.deger === 'cihaz') deger = { cihaz: kutu.querySelector('.db-cihaz').value };
    return { tablo: t.tablo, kural: k, deger: deger, kuralAdi: x.ad + (deger ? ' (' + (deger.cihaz || deger.bas + ' – ' + deger.bit) + ')' : ''), tabloAdi: t.ad };
  }
  function onayTemizle() { bekleyen = null; [].forEach.call(document.querySelectorAll('.db-onay-kutu'), function (k) { k.innerHTML = ''; }); }
  function onizle(kutu) {
    var p = parametre(kutu), cikti = kutu.querySelector('.db-onay-kutu');
    onayTemizle(); mesaj('');
    if (!p) { cikti.innerHTML = '<p class="db-risk">Önce bir silme seçeneği seçin.</p>'; return; }
    if (p.deger && p.kural === 'aralik' && (!p.deger.bas || !p.deger.bit || p.deger.bas > p.deger.bit)) { cikti.innerHTML = '<p class="db-risk">Geçerli bir tarih aralığı seçin.</p>'; return; }
    cikti.innerHTML = '<p class="sayac">Sayılıyor…</p>';
    var ek = p.tablo === 'emekli_gun' ? O.ozellik('gunler').then(function (g) {
      var ham = {}; g.ham.forEach(function (r) { ham[r[0] + '|' + r[1]] = 1; });
      return g.ozet.filter(function (r) { return !ham[r[0] + '|' + r[1]]; }).length;
    }, function () { return null; }) : Promise.resolve(null);
    Promise.all([db('', { islem: 'onizle', tablo: p.tablo, kural: p.kural, deger: p.deger }), ek]).then(function (s) {
      var v = s[0];
      if (!v.adet) { cikti.innerHTML = '<p>Bu seçenekle silinecek satır yok.</p>'; return; }
      bekleyen = { p: p, adet: v.adet, tehlikeli: v.tehlikeli, soz: v.onaySozu, kutu: kutu };
      cikti.innerHTML = '<div class="onay-metin"><p><b>' + esc(p.tabloAdi) + ' → ' + esc(p.kuralAdi) + ':</b> <b>' + sayi(v.adet) + ' satır</b> kalıcı olarak silinecek.</p>' +
        (s[1] ? '<p>Şu anda ' + sayi(s[1]) + ' günlük özetin ham logu yok; bunlar silinirse geri üretilemez.</p>' : '') +
        (p.tablo === 'emekli_log' ? '<p>Silmeden önce rapor özetleri hesaplanıp saklanacak.</p>' : '') +
        '<label class="db-secenek"><input type="checkbox" class="db-opt" checked> Sonrasında alanı geri kazan (OPTIMIZE)</label>' +
        (v.tehlikeli ? '<label class="db-secenek">Onaylamak için <b>' + v.onaySozu + '</b> yazın: <input type="text" class="db-soz" autocomplete="off" autocapitalize="characters"></label>' : '') +
        '<div class="onay-butonlar"><button type="button" data-is="vazgec">Vazgeç</button><button type="button" class="tehlike" data-is="sil"' + (v.tehlikeli ? ' disabled' : '') + '>Evet, sil</button></div></div>';
    }).catch(function (e) { cikti.innerHTML = '<p class="az-uyari">' + esc(O.hataMetni(e)) + '</p>'; });
  }
  function kilitle(k) {
    mesgul = k;
    [].forEach.call($('dbmodal').querySelectorAll('button, select, input'), function (b) { if (b.id !== 'dbkapat' && b.getAttribute('data-is') !== 'durdur') b.disabled = k; });
  }
  function sil() {
    if (!bekleyen || mesgul) return;
    var b = bekleyen, soz = b.kutu.querySelector('.db-soz'), opt = b.kutu.querySelector('.db-opt').checked;
    var govde = { islem: 'sil', tablo: b.p.tablo, kural: b.p.kural, deger: b.p.deger, onay: soz ? soz.value.trim().toLocaleUpperCase('tr-TR') : '' };
    var toplam = 0, basladi = false;
    durdur = false; kilitle(true);
    var cikti = b.kutu.querySelector('.db-onay-kutu');
    cikti.innerHTML = '<p class="sayac">Hazırlanıyor…</p>';
    function ilerle() {
      basladi = true; degisti = true;
      return db('', govde).then(function (v) {
        toplam += v.silinen;
        cikti.innerHTML = '<p>Siliniyor: ' + sayi(toplam) + ' / ' + sayi(b.adet) + (v.bitti ? '' : ' <button type="button" class="az-git" data-is="durdur">Durdur</button>') + '</p>';
        return !v.bitti && !durdur && v.silinen > 0 ? ilerle() : v.bitti;
      });
    }
    // Log silinmeden önce günlük özetler tamamlanır: rapor ve yolculuk geçmişi kaybolmasın
    var once = b.p.tablo === 'emekli_log' ? Rapor.senkron(function (t) { cikti.innerHTML = '<p class="sayac">' + esc(t) + '</p>'; }).then(function (s) {
      if (s.atlanan.length) throw new Error('ozet');
    }) : Promise.resolve();
    once.then(ilerle).then(function (bitti) {
      var metin = sayi(toplam) + ' satır silindi.' + (bitti ? '' : ' İşlem tamamlanmadan durdu; kalanlar için tekrarlayın.');
      if (!opt || !bitti || !toplam) return metin;
      cikti.innerHTML = '<p class="sayac">' + metin + ' Alan geri kazanılıyor (OPTIMIZE)…</p>';
      return db('', { islem: 'optimize', tablo: b.p.tablo }).then(function () { return metin + ' Alan geri kazanıldı.'; }, function () { return metin + ' Ancak OPTIMIZE başarısız oldu; Tablolar sekmesinden tekrar deneyebilirsiniz.'; });
    }).then(function (metin) { kilitle(false); bekleyen = null; return yukle().then(function () { mesaj(metin + ' Pencereyi kapatınca sayfa yenilenir.', 'ok'); }); })
      .catch(function (e) {
        kilitle(false); bekleyen = null;
        var m = !basladi ? 'Rapor özetleri hesaplanamadığı için HİÇBİR ŞEY SİLİNMEDİ. ' + (e && e.kod ? O.hataMetni(e) : 'Bazı günler hesaplanamadı.') : 'Silme yarıda kesildi (' + sayi(toplam) + ' satır silindi). ' + O.hataMetni(e);
        cikti.innerHTML = '<p class="az-uyari">' + esc(m) + '</p>';
      });
  }
  function optimize(ad) {
    if (mesgul) return;
    kilitle(true); mesaj('Optimize ediliyor…');
    db('', { islem: 'optimize', tablo: ad }).then(function () { kilitle(false); return yukle().then(function () { mesaj('Tablo optimize edildi: ' + ad, 'ok'); }); })
      .catch(function (e) { kilitle(false); mesaj(O.hataMetni(e), 'hata'); });
  }

  /* ---------- Yedek ---------- */
  function yedekHtml() {
    return '<p class="az-uyari">Yedek dosyası <b>tüm konum geçmişinizi ve kayıtlı adreslerinizi</b> içerir. Güvenli yerde saklayın, e-posta ya da paylaşım bağlantısıyla göndermeyin.</p>' +
      yedekDurumHtml() +
      '<form method="post" action="/emeklirobot/db.php" id="db-yedek-form"><input type="hidden" name="islem" value="yedek"><input type="hidden" name="csrf" value="' + esc(document.body.getAttribute('data-csrf')) + '">' +
      bolum('Tablolar', '<div class="db-secimler">' + bilgi.tablolar.filter(function (t) { return t.var; }).map(function (t) {
        return '<label><input type="checkbox" name="tablo[]" value="' + t.tablo + '" checked> ' + esc(t.ad) + ' <small>' + sayi(t.adet) + ' satır · ' + bayt(t.veriBayt) + '</small></label>';
      }).join('') + '</div>') +
      bolum('Konum logları için tarih aralığı (boşsa tümü)', '<p><input type="date" name="logBas" aria-label="Başlangıç günü"> – <input type="date" name="logBit" aria-label="Bitiş günü"></p>') +
      '<p><button type="submit" class="analiz-btn">SQL yedeğini indir</button></p></form>' +
      bolum('Geri yükleme', '<ol><li>phpMyAdmin’de EmekliRobot veritabanını seçin.</li><li>“İçe aktar” ile indirdiğiniz .sql dosyasını yükleyin.</li><li>Var olan satırlar korunur, yalnızca eksikler eklenir.</li></ol>' +
        '<p class="not">İndirdikten sonra dosyanın en sonunda “Yedek tamamlandı. N tablo, M satır” satırı olduğunu kontrol edin; yoksa ya da “HATA” yazıyorsa yedek eksiktir (hatanın altında nedeni yazar). Dosyanın başında içinde olması gereken tablolar listelenir. Çok büyük dosyada phpMyAdmin sınırına takılırsanız tarih aralığıyla parça parça yedek alın.</p>');
  }

  /* ---------- Geçmiş ve rehber ---------- */
  function gecmisCiz() {
    $('db-icerik').innerHTML = '<p class="sayac">Yükleniyor…</p>';
    var n = ++no;
    db('?islem=gecmis').then(function (v) {
      if (n !== no || sekme !== 'gecmis') return;
      var AD = { sil: 'Silme', optimize: 'OPTIMIZE', yedek: 'Yedek', yedek_tam: 'Tam yedek', yedek_hata: 'Yedek başarısız' };
      $('db-icerik').innerHTML = tablo(['Zaman', 'İşlem', 'Ayrıntı', 'Satır', 'IP'], v.islemler.map(function (i) { return [tarih(i[0]), AD[i[1]] || esc(i[1]), esc(i[2]), i[3] === null ? '—' : sayi(i[3]), esc(i[4])]; })) +
        '<p class="not">Son 200 işlem. Bu kayıt panelden silinemez. Tanımadığınız bir işlem ya da IP görürseniz panel şifrenizi hemen değiştirin.</p>';
    }).catch(function (e) { if (n === no) $('db-icerik').innerHTML = '<p class="az-uyari">' + esc(O.hataMetni(e)) + '</p>'; });
  }
  function rehberHtml() {
    return bolum('Veri nerede, ne işe yarar?', tablo(['Tablo', 'İçerik', 'Silinebilir mi?'], bilgi.tablolar.map(function (t) {
      return ['<b>' + esc(t.ad) + '</b><br><small class="db-ad">' + t.tablo + '</small>', '<span class="db-sar">' + esc(t.aciklama) + '</span>', t.korumali ? '🔒 Hayır' : 'Evet (onayla)'];
    }))) + bolum('İşlemler ve riskleri', '<div class="db-riskler">' + RISK_SATIR.map(function (r) {
      return '<article><b>' + esc(r[0]) + '</b><p>⚠️ ' + esc(r[1]) + '</p><p><span>Geri dönüş:</span> ' + esc(r[2]) + '</p><p><span>Önlem:</span> ' + esc(r[3]) + '</p></article>';
    }).join('') + '</div>') + bolum('Önerilen düzen', '<ol><li>Ayda bir yedek alın ve dosyayı güvenli yerde saklayın.</li><li>Saklama süresi belirleyin (örn. 6 ay); uyarı gelince önce yedek, sonra temizlik yapın.</li><li>Rapor özetlerini, yer kayıtlarını ve defteri silmeyin; az yer kaplar, değerlidir.</li><li>İşlem geçmişine ara sıra bakın.</li></ol>');
  }

  /* ---------- Pencere ---------- */
  function ciz() {
    [].forEach.call(document.querySelectorAll('#db-sekmeler button'), function (b) { var a = b.getAttribute('data-sekme') === sekme; b.classList.toggle('acik', a); b.setAttribute('aria-selected', a ? 'true' : 'false'); });
    bekleyen = null;
    if (!bilgi) return;
    if (sekme === 'gecmis') { gecmisCiz(); return; }
    no++;
    $('db-icerik').innerHTML = sekme === 'genel' ? genelHtml() : sekme === 'tablolar' ? tablolarHtml() : sekme === 'temizlik' ? temizlikHtml() : sekme === 'yedek' ? yedekHtml() : rehberHtml();
  }
  function yukle() {
    return db('?islem=genel').then(function (v) { bilgi = v; ciz(); }).catch(function (e) { mesaj(O.hataMetni(e), 'hata'); });
  }
  function sec(s) { if (mesgul) return; sekme = s; mesaj(''); ciz(); $('dbmodal').querySelector('.modal-kutu').scrollTop = 0; }
  function ac(ilkSekme) { sekme = ilkSekme || 'genel'; bilgi = null; mesaj(''); $('db-icerik').innerHTML = '<p class="sayac">Veritabanı inceleniyor…</p>'; $('dbmodal').hidden = false; ciz(); yukle(); }
  function kapat() {
    // Silme sürerken pencere kapanmaz
    if (mesgul) { $('dbmodal').hidden = false; return; }
    if (degisti) { location.reload(); return; }
    yedekYenile();
  }
  function saklamaTemizle() {
    sec('temizlik');
    var ay = bilgi.saklamaAy, kural = { 3: 'ay3', 6: 'ay6', 12: 'ay12' }[ay], kutu = $('db-icerik').querySelector('.db-temizlik[data-tablo="emekli_log"]');
    if (!kutu) return;
    if (!kural) { mesaj(ay + ' ay için hazır bir seçenek yok; “Tarih aralığı” ile silin.'); }
    else { kutu.querySelector('.db-kural').value = kural; onizle(kutu); }
    kutu.scrollIntoView({ block: 'start' });
  }

  function baslat() {
    O.pencere('dbmodal', 'dbkapat', kapat);
    $('b-db').addEventListener('click', function () { ac(); });
    $('yedek-al').addEventListener('click', function () { ac('yedek'); });
    $('yedek-sonra').addEventListener('click', function () {
      try { localStorage.setItem('er_yedek_gizle', O.istGun(Date.now())); } catch (e) {}
      $('yedek-serit').hidden = true;
    });
    yedekYenile();
    setInterval(function () { if (!document.hidden) yedekYenile(); }, 3600e3);
    $('db-sekmeler').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) sec(b.getAttribute('data-sekme')); });
    $('db-icerik').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-is]'); if (!b) return;
      var is = b.getAttribute('data-is');
      if (is === 'durdur') { durdur = true; b.disabled = true; }
      else if (mesgul) return;
      else if (is === 'incele') incele(b.getAttribute('data-tablo'));
      else if (is === 'optimize') optimize(b.getAttribute('data-tablo'));
      else if (is === 'onizle') onizle(b.closest('.db-temizlik'));
      else if (is === 'vazgec') { onayTemizle(); mesaj('Vazgeçildi.'); }
      else if (is === 'sil') sil();
      else if (is === 'yedege-git') sec('yedek');
      else if (is === 'saklama-temizle') saklamaTemizle();
      else if (is === 'yerler') { $('dbmodal').hidden = true; Yerler.yonetAc(); }
      else if (is === 'senkron') {
        kilitle(true);
        Rapor.senkron(mesaj).then(function () { kilitle(false); return yukle().then(function () { mesaj('Rapor özetleri güncel.', 'ok'); }); })
          .catch(function (err) { kilitle(false); mesaj(O.hataMetni(err), 'hata'); });
      }
    });
    $('db-icerik').addEventListener('input', function (e) {
      if (!e.target.classList.contains('db-soz') || !bekleyen) return;
      bekleyen.kutu.querySelector('[data-is="sil"]').disabled = e.target.value.trim().toLocaleUpperCase('tr-TR') !== bekleyen.soz;
    });
    $('db-icerik').addEventListener('change', function (e) {
      if (e.target.id === 'db-yedek-gun') {
        O.ozellik('ayar_kaydet', { anahtar: 'yedek_gun', deger: Number(e.target.value) }).then(yedekYenile).then(function () { mesaj('Hatırlatma süresi kaydedildi.', 'ok'); })
          .catch(function (err) { mesaj(O.hataMetni(err), 'hata'); });
        return;
      }
      if (e.target.id === 'db-saklama') {
        var ay = Number(e.target.value);
        O.ozellik('ayar_kaydet', { anahtar: 'saklama_ay', deger: ay }).then(function () { return yukle(); }).then(function () { mesaj('Saklama kuralı kaydedildi.', 'ok'); })
          .catch(function (err) { mesaj(O.hataMetni(err), 'hata'); });
        return;
      }
      var kutu = e.target.closest('.db-temizlik'); if (!kutu) return;
      if (e.target.classList.contains('db-kural')) {
        var p = tabloBilgi(kutu.getAttribute('data-tablo')).kurallar.filter(function (k) { return k.kural === e.target.value; })[0];
        kutu.querySelector('.db-aralik').hidden = !(p && p.deger === 'aralik');
        kutu.querySelector('.db-cihaz').hidden = !(p && p.deger === 'cihaz');
      }
      // Seçim değişirse eski onay geçersizdir
      if (e.target.matches('.db-kural, .db-bas, .db-bit, .db-cihaz')) onayTemizle();
    });
    $('db-icerik').addEventListener('submit', function (e) {
      if (e.target.id !== 'db-yedek-form') return;
      if (!e.target.querySelector('input[name="tablo[]"]:checked')) { e.preventDefault(); mesaj('En az bir tablo seçin.', 'hata'); return; }
      mesaj('Yedek hazırlanıyor; indirme birazdan başlar.', 'ok');
      // İndirmenin bitişi tarayıcıdan izlenemez; durum birkaç kez yeniden sorulur
      [4, 15, 45, 120].forEach(function (s) { setTimeout(yedekYenile, s * 1000); });
    });
  }

  window.DbYonetim = { baslat: baslat };
})();
