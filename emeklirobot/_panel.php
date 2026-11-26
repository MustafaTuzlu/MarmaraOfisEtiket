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
<header class="ust">
  <strong>Emekli Robot</strong>
  <span id="durum" class="durum"></span>
  <label class="oto"><input type="checkbox" id="f-oto"> 15 sn'de bir yenile</label>
  <button type="button" id="b-ses" class="sesbtn" aria-pressed="false" title="Bildirim sesi: kapalı (açmak için tıkla)">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>
      <g class="dalga"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></g>
      <path class="cizgi" d="m16 9 5 6m0-6-5 6"/>
    </svg>
  </button>
  <button type="button" id="b-anlik" class="dbbtn">Bana son durumu göster</button>
  <button type="button" id="b-db" class="dbbtn">DB Ayarları</button>
  <form method="post" action="/emeklirobot/" class="cikis">
    <input type="hidden" name="islem" value="cikis">
    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf(), ENT_QUOTES, 'UTF-8') ?>">
    <button type="submit">Çıkış</button>
  </form>
</header>

<section class="kart" id="filtre">
<details class="filtre-ac">
<summary>Filtreler</summary>
<div class="filtre-govde">
  <div class="satir">
    <label>Başlangıç <input type="datetime-local" id="f-bas"></label>
    <label>Bitiş <input type="datetime-local" id="f-bit"></label>
    <div class="hizli">
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
    <label>Hız <select id="a-hiz"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label>
    <input type="range" id="a-kaydir" min="0" max="1000" value="0" step="1">
    <label class="onay"><input type="checkbox" id="a-takip" checked> Aracı takip et</label>
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
    <a href="#" id="b-excel" class="excel">Excel indir (.xlsx)</a>
  </div>
  <div class="tablo-kap">
    <table id="liste"><thead></thead><tbody></tbody></table>
  </div>
</section>

<div id="anmodal" class="modal" hidden>
  <div class="modal-kutu genis" role="dialog" aria-modal="true" aria-labelledby="anbaslik">
    <button type="button" class="modal-kapat" id="ankapat" aria-label="Kapat">×</button>
    <h2 id="anbaslik">Anlık durum</h2>
    <div class="bilgi-kutu" role="note">
      <strong>Bilgi</strong>
      <ul>
        <li>Telefon dakikada bir yeni istek olup olmadığını kontrol eder; ekran kapalı veya şarjda değilken bu birkaç dakikaya (en çok ~9 dk) uzayabilir. İnternet yoksa bağlanınca cevaplanır.</li>
        <li>Bir cihaz için aynı anda tek bekleyen istek olur; art arda basmak yeni istek açmaz, tek cevap gelir.</li>
        <li>İstek 30 dk içinde cevaplanmazsa zaman aşımına uğrar; eski isteğe geç cevap verilmez.</li>
        <li>Anlık durum log olarak kaydedilmez, yalnızca son durum olarak tutulur.</li>
      </ul>
    </div>
    <div id="an-liste" class="an-liste"></div>
    <div id="an-sonuc" class="an-sonuc" hidden></div>
    <p id="an-mesaj" class="mesaj" role="status"></p>
    <p id="an-geri" class="sayac"></p>
    <p id="an-not" class="not" hidden></p>
  </div>
</div>

<div id="dbmodal" class="modal" hidden>
  <div class="modal-kutu" role="dialog" aria-modal="true" aria-labelledby="dbbaslik">
    <button type="button" class="modal-kapat" id="dbkapat" aria-label="Kapat">×</button>
    <h2 id="dbbaslik">Veritabanı Ayarları</h2>
    <div class="istat">
      <div><span>Toplam kayıt</span><strong id="db-toplam">…</strong></div>
      <div><span>Tablo boyutu</span><strong id="db-boyut">…</strong></div>
      <div><span>En eski</span><strong id="db-eski">…</strong></div>
      <div><span>En yeni</span><strong id="db-yeni">…</strong></div>
    </div>
    <div id="db-ana">
      <p class="not">Kayıt silmek için bir seçenek seçin. Silinen kayıtlar geri getirilemez.</p>
      <div class="sil-butonlar">
        <button type="button" data-kural="bugun">Bugüne ait olanları sil</button>
        <button type="button" data-kural="hafta">1 haftadan eski olanları sil</button>
        <button type="button" data-kural="ay">1 aydan eski olanları sil</button>
        <button type="button" data-kural="hepsi" class="tehlike">Hepsini sil</button>
      </div>
      <p class="alt"><a href="#" id="db-optimize">Alanı geri kazan (OPTIMIZE)</a> <small>— silmeden sonra tablo boyutu küçülmezse</small></p>
    </div>
    <div id="db-onay" hidden>
      <p id="db-onay-metin" class="onay-metin"></p>
      <div class="onay-butonlar">
        <button type="button" id="db-vazgec">Vazgeç</button>
        <button type="button" id="db-evet" class="tehlike">Evet, sil</button>
      </div>
    </div>
    <p id="db-mesaj" class="mesaj" role="status"></p>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="/emeklirobot/xlsx.js"></script>
<script src="/emeklirobot/app.js"></script>
</body>
</html>
