<?php if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_panel.php') { http_response_code(403); exit; } ?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>Panel</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<link rel="stylesheet" href="/emeklirobot/app.css">
</head>
<body data-csrf="<?= htmlspecialchars(csrf(), ENT_QUOTES, 'UTF-8') ?>">
<div id="yukleniyor" role="status" aria-live="polite">
  <div class="yk-kutu"><span class="yk-halka" aria-hidden="true"></span><span>Yükleniyor…</span></div>
</div>
<header class="ust">
  <strong class="marka"><svg class="logo" viewBox="22 16 64 76" width="26" height="31" aria-hidden="true"><g fill="none" stroke="#3DDC84" stroke-width="2.6" stroke-linecap="round"><path d="M45 28L40 20"/><path d="M63 28L68 20"/></g><g fill="#3DDC84"><path d="M33 58H75V76Q75 82 69 82H39Q33 82 33 76Z"/><path d="M25 60A3 3 0 0 1 31 60V76A3 3 0 0 1 25 76Z"/><path d="M77 60A3 3 0 0 1 83 60V76A3 3 0 0 1 77 76Z"/><path d="M32 52A22 22 0 0 1 76 52Z"/></g><g fill="#fff"><circle cx="45" cy="42" r="2.8"/><circle cx="63" cy="42" r="2.8"/></g><path d="M31 48C30 60 33 70 41 77C46 81 50 86 54 86C58 86 62 81 67 77C75 70 78 60 77 48C72 54 64 56 54 56C44 56 36 54 31 48Z" fill="#ECEFF1" stroke="#90A4AE" stroke-width=".9"/><g fill="none" stroke="#B0BEC5" stroke-width="1" stroke-linecap="round"><path d="M44 66Q46 72 44 78"/><path d="M54 68V82"/><path d="M64 66Q62 72 64 78"/></g><path d="M38 55C43 49 50 50 54 55C58 50 65 49 70 55C65 60 58 58 54 57C50 58 43 60 38 55Z" fill="#CFD8DC" stroke="#90A4AE" stroke-width=".9"/></svg><span>Emekli Robot</span></strong>
  <span id="durum" class="durum"></span>
  <label class="oto"><input type="checkbox" id="f-oto" checked> 15 sn'de bir yenile</label>
  <button type="button" id="b-ses" class="sesbtn" aria-pressed="false" title="Bildirim sesi: kapalı (açmak için tıkla)">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>
      <g class="dalga"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></g>
      <path class="cizgi" d="m16 9 5 6m0-6-5 6"/>
    </svg>
  </button>
  <button type="button" id="b-anlik" class="dbbtn">Anlık Durum</button>
  <div class="ayar-kap">
    <button type="button" id="b-ayar" class="dbbtn" aria-haspopup="true" aria-expanded="false" aria-controls="ayar-menu">Ayarlar <span aria-hidden="true">▾</span></button>
    <div id="ayar-menu" class="ayar-menu" hidden>
      <button type="button" id="b-yerler">Yerlerim</button>
      <button type="button" id="b-db">Veritabanı Yönetimi</button>
      <button type="button" id="b-harita-ayar">Harita Ayarları</button>
    </div>
  </div>
  <form method="post" action="/emeklirobot/" class="cikis">
    <input type="hidden" name="islem" value="cikis">
    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf(), ENT_QUOTES, 'UTF-8') ?>">
    <button type="submit">Çıkış</button>
  </form>
</header>

<nav class="arac-cubugu" aria-label="Panel araçları">
  <button type="button" data-ac="yolculuk">🧭 Yolculuklar</button>
  <button type="button" data-ac="rapor">📊 Rapor</button>
  <button type="button" data-ac="ziyaret">📌 Ziyaretler</button>
  <button type="button" data-ac="karne">🗒️ Aylık karne</button>
  <button type="button" data-ac="dikkat">👀 Dikkat çekenler</button>
  <button type="button" data-ac="saglik">🩺 Cihaz sağlığı</button>
  <button type="button" data-ac="kor">📡 GPS kör noktaları</button>
  <button type="button" data-ac="nezaman">🔎 Buraya ne zaman gittim?</button>
  <button type="button" data-ac="masraf">💳 Masraf</button>
  <button type="button" data-ac="bakim">🔧 Bakım</button>
  <button type="button" data-ac="yerler">📍 Yerlerim</button>
</nav>

<div id="yedek-serit" class="yedek-serit" role="status" hidden>
  <span id="yedek-serit-metin"></span>
  <span class="yedek-serit-dugme"><button type="button" id="yedek-al">Yedek al</button><button type="button" id="yedek-sonra">Bugün gizle</button></span>
</div>

<section class="kart" id="son-durum">
  <details id="sd" open>
    <summary><span>Son durum</span><span id="sd-ozet" class="sd-ozet"></span></summary>
    <div id="sd-liste" class="sd-liste"></div>
    <p id="sd-mesaj" class="sayac" role="status"></p>
  </details>
</section>

<section class="kart" id="filtre">
<details class="filtre-ac">
<summary><span>Filtreler</span><span id="f-ozet" class="filtre-ozet"></span></summary>
<div class="filtre-govde">
  <div class="satir">
    <label>Başlangıç <input type="datetime-local" id="f-bas"></label>
    <label>Bitiş <input type="datetime-local" id="f-bit"></label>
    <div class="hizli">
      <button type="button" data-dk="15">Son 15 dk</button>
      <button type="button" data-dk="20">Son 20 dk</button>
      <button type="button" data-saat="1">Son 1 sa</button>
      <button type="button" data-saat="6">Son 6 sa</button>
      <button type="button" data-saat="24">Son 24 sa</button>
      <button type="button" data-saat="168">Son 7 gün</button>
      <button type="button" data-saat="bugun">Bugün</button>
    </div>
  </div>
  <div class="grup"><span class="etiket">Log tipi</span><div id="f-tipler" class="cipler"></div></div>
  <div class="grup"><span class="etiket">Cihaz</span><div id="f-cihazlar" class="cipler"></div></div>
  <div class="satir">
    <label>Araç <select id="f-hareket"><option value="">Hepsi</option><option value="hareket">Hareketli</option><option value="duragan">Durağan</option></select></label>
    <label>Şarj/kontak <select id="f-sarj"><option value="">Hepsi</option><option value="evet">Şarjda (kontak açık)</option><option value="hayir">Şarjda değil</option></select></label>
    <label>Pil % <span class="aralik"><input type="number" id="f-pilMin" min="0" max="100" placeholder="min"><input type="number" id="f-pilMax" min="0" max="100" placeholder="max"></span></label>
    <label>Pil sıcaklığı °C <span class="aralik"><input type="number" id="f-sicMin" step="0.1" placeholder="min"><input type="number" id="f-sicMax" step="0.1" placeholder="max"></span></label>
    <label>Doğruluk ≤ (m) <input type="number" id="f-dogMax" min="0" placeholder="örn. 50"></label>
    <label class="onay"><input type="checkbox" id="f-konumlu"> Yalnızca konumlu kayıtlar</label>
  </div>
  <div class="satir butonlar">
    <button type="button" id="b-uygula" class="birincil">Filtrele</button>
    <button type="button" id="b-temizle">Tüm filtreleri temizle</button>
    <span id="sayac" class="sayac"></span>
  </div>
</div>
</details>
</section>

<section class="kart" id="anim">
  <div class="anim-satir">
    <strong>Rota animasyonu</strong>
    <button type="button" id="a-oynat" class="btn">▶ Başlat</button>
    <button type="button" id="a-sifirla" class="btn">■ Başa al</button>
    <label class="a-hiz-kutu"><span>Hız</span><select id="a-hiz"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label>
    <input type="range" id="a-kaydir" min="0" max="1000" value="0" step="1">
    <label class="a-takip-kutu"><input type="checkbox" id="a-takip" class="anahtar" checked><i></i><span>Aracı takip et</span></label>
    <span id="a-bilgi" class="anim-bilgi">—</span>
  </div>
</section>
<section class="ana detay-kapali" id="ana">
  <div id="harita"></div>
  <button type="button" id="detay-ac" class="detay-tus" title="Log detayını aç" aria-label="Log detayını aç" aria-expanded="false">&#9776;</button>
  <aside class="kart" id="detay-kap"><button type="button" id="detay-kapat" class="detay-tus kapat" title="Kapat" aria-label="Log detayını kapat">&#10095;</button><div id="detay"><p class="bos">Bir kayıt seçin.</p></div></aside>
</section>

<section class="kart">
  <div class="liste-ust">
    <h2>Son
      <select id="f-limit"><option value="100">100</option><option value="250" selected>250</option><option value="500">500</option><option value="1000">1000</option></select>
      kayıt</h2>
    <div class="liste-araclar">
      <button type="button" id="b-analiz" class="analiz-btn">Analiz et</button>
      <a href="#" id="b-excel" class="excel">Excel indir (.xlsx)</a>
    </div>
  </div>
  <div class="tablo-kap">
    <table id="liste"><thead></thead><tbody></tbody></table>
  </div>
</section>

<div id="anmodal" class="modal" hidden>
  <div class="modal-kutu genis" role="dialog" aria-modal="true" aria-labelledby="anbaslik">
    <button type="button" class="modal-kapat" id="ankapat" aria-label="Kapat">×</button>
    <h2 id="anbaslik">Anlık Durum</h2>
    <details class="bilgi-kutu">
      <summary>Bilgi</summary>
      <ul>
        <li>Telefon dakikada bir yeni istek olup olmadığını kontrol eder; ekran kapalı veya şarjda değilken bu birkaç dakikaya (en çok ~9 dk) uzayabilir. İnternet yoksa bağlanınca cevaplanır.</li>
        <li>Bir cihaz için aynı anda tek bekleyen istek olur; art arda basmak yeni istek açmaz, tek cevap gelir.</li>
        <li>İstek 30 dk içinde cevaplanmazsa zaman aşımına uğrar; eski isteğe geç cevap verilmez.</li>
        <li>Anlık durum log olarak kaydedilmez, yalnızca son durum olarak tutulur.</li>
      </ul>
    </details>
    <div id="an-liste" class="an-liste"></div>
    <div id="an-sonuc" class="an-sonuc" hidden></div>
    <p id="an-mesaj" class="mesaj" role="status"></p>
    <p id="an-geri" class="sayac"></p>
    <p id="an-not" class="not" hidden></p>
  </div>
</div>

<div id="azmodal" class="modal" hidden>
  <div class="modal-kutu az-kutu" role="dialog" aria-modal="true" aria-labelledby="azbaslik">
    <button type="button" class="modal-kapat" id="azkapat" aria-label="Kapat">×</button>
    <h2 id="azbaslik">Analiz</h2>
    <div class="az-ust">
      <span id="az-kapsam" class="sayac"></span>
      <label class="az-hiz-sinir">Hız sınırı <input type="number" id="az-hiz" min="10" max="300" step="5" inputmode="numeric"> km/sa</label>
    </div>
    <p id="az-uyari" class="az-uyari" hidden></p>
    <div id="az-durum" class="az-durum" role="status" hidden></div>
    <div id="az-icerik"></div>
  </div>
</div>

<div id="rpmodal" class="modal" hidden>
  <div class="modal-kutu az-kutu" role="dialog" aria-modal="true" aria-labelledby="rpbaslik">
    <button type="button" class="modal-kapat" id="rpkapat" aria-label="Kapat">×</button>
    <h2 id="rpbaslik">Yolculuklar ve rapor</h2>
    <p id="rp-baski" class="rp-baski"></p>
    <div id="rp-sekmeler" class="rp-sekmeler" role="tablist">
      <button type="button" role="tab" data-sekme="yolculuk">Yolculuklar</button>
      <button type="button" role="tab" data-sekme="rapor">Rapor</button>
      <button type="button" role="tab" data-sekme="guzergah">Sık güzergâhlar</button>
      <button type="button" role="tab" data-sekme="ziyaret">Ziyaretler</button>
      <button type="button" role="tab" data-sekme="karne">Aylık karne</button>
      <button type="button" role="tab" data-sekme="dikkat">Dikkat çekenler</button>
      <button type="button" role="tab" data-sekme="saglik">Cihaz sağlığı</button>
      <button type="button" role="tab" data-sekme="kor">GPS kör noktaları</button>
    </div>
    <div class="rp-suzgec">
      <label>Dönem <select id="rp-donem"><option value="7">Son 7 gün</option><option value="hafta">Bu hafta</option><option value="ay">Bu ay</option><option value="30" selected>Son 30 gün</option><option value="gecenay">Geçen ay</option><option value="90">Son 90 gün</option><option value="365">Son 1 yıl</option><option value="aysec">Ay seç…</option><option value="ozel">Tarih seç…</option></select></label>
      <input type="month" id="rp-ay" aria-label="Ay" hidden>
      <span id="rp-ozel" class="rp-ozel" hidden><label>Başlangıç <input type="date" id="rp-bas"></label><label>Bitiş <input type="date" id="rp-bit"></label></span>
      <label>Cihaz <select id="rp-cihaz"><option value="">Tüm cihazlar</option></select></label>
      <label id="rp-etiket-kap">Tür <select id="rp-etiket"><option value="">Hepsi</option><option value="is">İş</option><option value="ozel">Özel</option><option value="yok">Etiketsiz</option></select></label>
      <label id="rp-ara-kap">Yer ya da not ara <input type="search" id="rp-ara" maxlength="80" placeholder="örn. Torun, müşteri" autocomplete="off" spellcheck="false"></label>
      <span class="rp-cikti"><button type="button" id="rp-excel" class="excel">Excel</button><button type="button" id="rp-yazdir" class="excel">Yazdır / PDF</button></span>
    </div>
    <div id="rp-durum" class="az-durum" role="status" hidden></div>
    <p id="rp-mesaj" class="sayac" role="status"></p>
    <div id="rp-icerik"></div>
  </div>
</div>

<div id="nzmodal" class="modal" hidden>
  <div class="modal-kutu az-kutu" role="dialog" aria-modal="true" aria-labelledby="nzbaslik">
    <button type="button" class="modal-kapat" id="nzkapat" aria-label="Kapat">×</button>
    <h2 id="nzbaslik">Buraya ne zaman gittim?</h2>
    <div class="rp-suzgec">
      <label>Yarıçap <select id="nz-yaricap"><option value="75">75 m</option><option value="150" selected>150 m</option><option value="300">300 m</option><option value="500">500 m</option><option value="1000">1 km</option></select></label>
      <label>Cihaz <select id="nz-cihaz"><option value="">Tüm cihazlar</option></select></label>
      <span class="rp-cikti"><button type="button" id="nz-excel" class="excel">Excel</button></span>
    </div>
    <p id="nz-mesaj" class="sayac" role="status"></p>
    <div id="nz-icerik"></div>
  </div>
</div>

<div id="bkmodal" class="modal" hidden>
  <div class="modal-kutu az-kutu" role="dialog" aria-modal="true" aria-labelledby="bkbaslik">
    <button type="button" class="modal-kapat" id="bkkapat" aria-label="Kapat">×</button>
    <h2 id="bkbaslik">Bakım hatırlatıcı</h2>
    <p class="not">Kilometre, girdiğiniz gösterge değerine GPS mesafesi eklenerek tahmin edilir. GPS’siz dönemler sayılmadığı için ara sıra göstergedeki değeri yeniden girin. Uyarılar yalnızca bu panelde görünür.</p>
    <datalist id="bk-adlar"><option value="Yağ değişimi"></option><option value="Periyodik bakım"></option><option value="Lastik değişimi"></option><option value="Muayene"></option><option value="Trafik sigortası"></option><option value="Kasko"></option></datalist>
    <p id="bk-mesaj" class="sayac" role="status"></p>
    <div id="bk-icerik"></div>
  </div>
</div>

<div id="msmodal" class="modal" hidden>
  <div class="modal-kutu az-kutu" role="dialog" aria-modal="true" aria-labelledby="msbaslik">
    <button type="button" class="modal-kapat" id="mskapat" aria-label="Kapat">×</button>
    <h2 id="msbaslik">Masraf defteri</h2>
    <div class="rp-suzgec">
      <label>Dönem <select id="ms-donem"><option value="ay">Bu ay</option><option value="gecenay">Geçen ay</option><option value="90">Son 90 gün</option><option value="yil" selected>Bu yıl</option><option value="365">Son 1 yıl</option><option value="ozel">Özel (tarih ve saat)</option></select></label>
      <span id="ms-ozel" class="rp-ozel" hidden><label>Başlangıç <input type="datetime-local" id="ms-bas"></label><label>Bitiş <input type="datetime-local" id="ms-bit"></label></span>
      <label>Araç <select id="ms-cihaz"><option value="">Tüm araçlar</option></select></label>
      <span class="rp-cikti"><button type="button" id="ms-excel" class="excel">Excel</button></span>
    </div>
    <p id="ms-mesaj" class="sayac" role="status"></p>
    <div id="ms-icerik"></div>
  </div>
</div>

<div id="yrmodal" class="modal" hidden>
  <div class="modal-kutu genis" role="dialog" aria-modal="true" aria-labelledby="yrbaslik">
    <button type="button" class="modal-kapat" id="yrkapat" aria-label="Kapat">×</button>
    <h2 id="yrbaslik">Yerlerim</h2>
    <p class="not">Bir yerin birden fazla konumu olabilir (bina, otopark, sokak parkı). Adlar analizde, yolculuklarda ve raporda kullanılır; geçmiş kayıtlarda da görünür. Taşınırsanız eski yeri değiştirmek yerine yeni yer ekleyin.</p>
    <p><button type="button" id="yr-ekle" class="analiz-btn">+ Haritadan yer ekle</button></p>
    <p id="yr-mesaj" class="sayac" role="status"></p>
    <div id="yr-liste"></div>
  </div>
</div>

<div id="yerpanel" role="dialog" aria-labelledby="yp-baslik" hidden>
  <div class="yp-ust"><b id="yp-baslik">Konum kaydet</b><span>Haritaya tıklayın ya da işareti sürükleyin.</span></div>
  <div class="yp-koord">
    <label for="yp-koord">Koordinat (enlem, boylam)</label>
    <div><input id="yp-koord" maxlength="80" placeholder="41.1144876, 28.5647841" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" id="yp-git">Konuma git</button></div>
  </div>
  <div class="yp-alanlar">
    <label>Yer <select id="yp-yer"></select></label>
    <span id="yp-yeni" class="yp-yeni"><label>Yeni yer adı <input id="yp-ad" maxlength="60" placeholder="örn. TorunCenter"></label><label>Tür <select id="yp-tur"><option value="ev">Ev</option><option value="is">İş yeri</option><option value="diger">Diğer</option></select></label></span>
    <label>Konum etiketi <input id="yp-etiket" maxlength="40" placeholder="örn. Otopark"></label>
    <label class="yp-yaricap-kap">Yarıçap: <b id="yp-yaricap-yaz">150 m</b><input type="range" id="yp-yaricap" min="30" max="1000" step="10" value="150"></label>
  </div>
  <p id="yp-uyari" class="yp-uyari"></p>
  <div class="yp-alt"><span id="yp-mesaj" role="status"></span><button type="button" id="yp-vazgec">Vazgeç</button><button type="button" id="yp-kaydet" class="analiz-btn">Kaydet</button></div>
</div>

<div id="hamodal" class="modal" hidden>
  <div class="modal-kutu" role="dialog" aria-modal="true" aria-labelledby="habaslik">
    <button type="button" class="modal-kapat" id="hakapat" aria-label="Kapat">×</button>
    <h2 id="habaslik">Harita Ayarları</h2>
    <label class="ha-etiket" for="ha-dk">Son konum halka efekti süresi</label>
    <div class="ha-sayac">
      <button type="button" id="ha-azalt" aria-label="Süreyi azalt">−</button>
      <input type="number" id="ha-dk" min="1" max="1440" step="1" inputmode="numeric">
      <button type="button" id="ha-artir" aria-label="Süreyi artır">+</button>
      <span>dakika</span>
    </div>
    <p id="ha-aciklama" class="not"></p>
    <p class="not">− ve + düğmeleri 5'er dakika değiştirir; kutuya istediğiniz değeri de yazabilirsiniz (1–1440). Ayar bu tarayıcıda saklanır.</p>
    <p class="alt"><a href="#" id="ha-varsayilan">Varsayılana dön (20 dk)</a></p>
  </div>
</div>

<div id="dbmodal" class="modal" hidden>
  <div class="modal-kutu az-kutu db-kutu" role="dialog" aria-modal="true" aria-labelledby="dbbaslik">
    <button type="button" class="modal-kapat" id="dbkapat" aria-label="Kapat">×</button>
    <h2 id="dbbaslik">Veritabanı Yönetimi</h2>
    <div id="db-sekmeler" class="rp-sekmeler" role="tablist">
      <button type="button" role="tab" data-sekme="genel">Genel bakış</button>
      <button type="button" role="tab" data-sekme="tablolar">Tablolar</button>
      <button type="button" role="tab" data-sekme="temizlik">Temizlik</button>
      <button type="button" role="tab" data-sekme="yedek">Yedek</button>
      <button type="button" role="tab" data-sekme="gecmis">İşlem geçmişi</button>
      <button type="button" role="tab" data-sekme="rehber">Rehber ve riskler</button>
    </div>
    <p id="db-mesaj" class="mesaj" role="status"></p>
    <div id="db-icerik"></div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="/emeklirobot/xlsx.js"></script>
<script src="/emeklirobot/analiz.js"></script>
<script src="/emeklirobot/ortak.js"></script>
<script src="/emeklirobot/yerler.js"></script>
<script src="/emeklirobot/analiz-ui.js"></script>
<script src="/emeklirobot/son-durum.js"></script>
<script src="/emeklirobot/rapor.js"></script>
<script src="/emeklirobot/rapor-ek.js"></script>
<script src="/emeklirobot/ne-zaman.js"></script>
<script src="/emeklirobot/masraf.js"></script>
<script src="/emeklirobot/bakim.js"></script>
<script src="/emeklirobot/db-yonetim.js"></script>
<script src="/emeklirobot/app.js"></script>
</body>
</html>
