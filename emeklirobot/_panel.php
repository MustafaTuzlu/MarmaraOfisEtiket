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
<body>
<header class="ust">
  <strong>Emekli Robot</strong>
  <span id="durum" class="durum"></span>
  <label class="oto"><input type="checkbox" id="f-oto"> 15 sn'de bir yenile</label>
  <form method="post" action="/emeklirobot/" class="cikis">
    <input type="hidden" name="islem" value="cikis">
    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf(), ENT_QUOTES, 'UTF-8') ?>">
    <button type="submit">Çıkış</button>
  </form>
</header>

<section class="kart" id="filtre">
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
</section>

<section class="ana">
  <div id="harita"></div>
  <aside class="kart" id="detay"><p class="bos">Bir kayıt seçin.</p></aside>
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

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="/emeklirobot/xlsx.js"></script>
<script src="/emeklirobot/app.js"></script>
</body>
</html>
