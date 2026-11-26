<?php
// GET /api/emekli/surum.php -> yayındaki uygulama sürümü (yayin/surum.json doğrulanıp döner)
// Sözleşme: docs/emekli-robot-api.md (v1.2)
require __DIR__ . '/_ortak.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    hata(405, 'yontem_desteklenmiyor', 'Yalnızca GET kullanın.');
}
yetkilendir();

$dosya = __DIR__ . '/yayin/surum.json';
if (!is_file($dosya)) { hata(404, 'surum_yok', 'Yayında sürüm bilgisi yok.'); }
$ham = @file_get_contents($dosya, false, null, 0, 8193);
$d = ($ham === false || strlen($ham) > 8192) ? null : json_decode($ham, true);

$neden = null;
if (!is_array($d)) { $neden = 'JSON okunamadı veya çok büyük'; }
elseif (!isset($d['versionCode']) || !is_int($d['versionCode']) || $d['versionCode'] < 1) { $neden = 'versionCode'; }
elseif (!isset($d['versionName']) || !is_string($d['versionName']) || strlen($d['versionName']) < 1 || strlen($d['versionName']) > 20) { $neden = 'versionName'; }
elseif (!isset($d['sha256']) || !is_string($d['sha256']) || !preg_match('/^[0-9a-fA-F]{64}$/', $d['sha256'])) { $neden = 'sha256'; }
elseif (!isset($d['boyut']) || !is_int($d['boyut']) || $d['boyut'] < 1) { $neden = 'boyut'; }
elseif (isset($d['notlar']) && (!is_string($d['notlar']) || (function_exists('mb_strlen') ? mb_strlen($d['notlar'], 'UTF-8') : strlen($d['notlar'])) > 500)) { $neden = 'notlar'; }

if ($neden !== null) {
    error_log('emekli surum.json gecersiz: ' . $neden);
    hata(404, 'surum_yok', 'Sürüm bilgisi geçersiz.');
}

yanit(200, [
    'ok' => true,
    'versionCode' => $d['versionCode'],
    'versionName' => $d['versionName'],
    'sha256' => strtolower($d['sha256']),
    'boyut' => $d['boyut'],
    'notlar' => isset($d['notlar']) ? $d['notlar'] : '',
]);
