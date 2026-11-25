<?php
// GET /api/emekli/ping.php  -> bağlantı + anahtar + veritabanı testi ("Bağlantıyı test et")
require __DIR__ . '/_ortak.php';

$m = $_SERVER['REQUEST_METHOD'] ?? '';
if ($m !== 'GET' && $m !== 'HEAD') {
    header('Allow: GET, HEAD');
    hata(405, 'yontem_desteklenmiyor', 'Yalnızca GET kullanın.');
}
yetkilendir();

$pdo = db();
try {
    $pdo->query('SELECT 1')->fetchColumn();
} catch (Exception $e) {
    error_log('emekli ping: ' . $e->getMessage());
    hata(503, 'veritabani_hatasi', 'Veritabanı sorgusu başarısız.');
}

$t = microtime(true);
yanit(200, [
    'ok' => true,
    'servis' => 'emekli-robot',
    'surum' => 1,
    'sunucuZamani' => gmdate('Y-m-d\TH:i:s', (int)$t) . 'Z',
    'sunucuUnixMs' => (int)round($t * 1000),
    'veritabani' => 'ok',
]);
