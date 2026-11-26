<?php
// GET|HEAD /api/emekli/indir.php -> yayin/emekli.apk dosyasını akıtır (belleğe komple okunmaz)
// Sözleşme: docs/emekli-robot-api.md (v1.2)
require __DIR__ . '/_ortak.php';

$m = $_SERVER['REQUEST_METHOD'] ?? '';
if ($m !== 'GET' && $m !== 'HEAD') {
    header('Allow: GET, HEAD');
    hata(405, 'yontem_desteklenmiyor', 'Yalnızca GET veya HEAD kullanın.');
}
yetkilendir();

$apk = __DIR__ . '/yayin/emekli.apk';
clearstatcache(true, $apk);
if (!is_file($apk) || !is_readable($apk)) { hata(404, 'apk_yok', 'Yayında APK yok.'); }
$boyut = filesize($apk);
if ($boyut === false || $boyut < 1) { hata(404, 'apk_yok', 'Yayında APK yok.'); }

// Çıktı tamponlarını ve sıkıştırmayı kapat: dosya parça parça akar, bellek şişmez, Content-Length doğru kalır
@ini_set('zlib.output_compression', '0');
if (function_exists('apache_setenv')) { @apache_setenv('no-gzip', '1'); }
while (ob_get_level() > 0) { @ob_end_clean(); }
@set_time_limit(0);

header('Content-Type: application/vnd.android.package-archive');
header('Content-Length: ' . $boyut);
header('Content-Disposition: attachment; filename="emekli.apk"');
header('Cache-Control: no-store');
header('Accept-Ranges: none');

if ($m === 'HEAD') { exit; }
$f = @fopen($apk, 'rb');
if ($f === false) { error_log('emekli indir: apk acilamadi'); exit; }
while (!feof($f) && connection_status() === CONNECTION_NORMAL) {
    echo fread($f, 65536);
    flush();
}
fclose($f);
