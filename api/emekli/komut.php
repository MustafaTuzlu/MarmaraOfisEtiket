<?php
// GET /api/emekli/komut.php?cihazAdi=<ad> -> bekleyen komut var mı? (telefon yoklar)
// Sözleşme: docs/emekli-robot-api.md (v1.1)
require __DIR__ . '/_ortak.php';

const KOMUT_OMUR = 1800; // 30 dk

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    hata(405, 'yontem_desteklenmiyor', 'Yalnızca GET kullanın.');
}
yetkilendir();

$cihaz = $_GET['cihazAdi'] ?? null;
if (!is_string($cihaz) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $cihaz)) {
    hata(422, 'gecersiz_cihaz', 'cihazAdi gerekli (1-50 karakter, yalnızca A-Z a-z 0-9 _ -).');
}

$simdi = time();
$pdo = db();
try {
    // 30 dk'dan eski bekleyenleri zaman aşımına uğrat
    $st = $pdo->prepare("UPDATE emekli_komut SET durum = 'ZAMAN_ASIMI', bekleyen = NULL, tamamlanma = ? "
        . "WHERE cihaz_adi = ? AND bekleyen = 1 AND olusturma < ?");
    $st->execute([gmdate('Y-m-d H:i:s', $simdi), $cihaz, gmdate('Y-m-d H:i:s', $simdi - KOMUT_OMUR)]);

    $st = $pdo->prepare("SELECT id, tip, olusturma FROM emekli_komut WHERE cihaz_adi = ? AND bekleyen = 1 ORDER BY id DESC LIMIT 1");
    $st->execute([$cihaz]);
    $k = $st->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    error_log('emekli komut: ' . $e->getMessage());
    hata(500, 'sunucu_hatasi', 'Komut sorgulanamadı.');
}

yanit(200, [
    'ok' => true,
    'komut' => $k ? [
        'id' => (int)$k['id'],
        'tip' => $k['tip'],
        'olusturma' => str_replace(' ', 'T', $k['olusturma']) . 'Z',
    ] : null,
]);
