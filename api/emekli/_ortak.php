<?php
// EmekliRobot API ortak yardımcıları. Tarayıcıdan doğrudan çağrılamaz (.htaccess + bu koruma).
// PHP 7.0+ uyumlu.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_ortak.php') { http_response_code(403); exit; }

require __DIR__ . '/../../config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function yanit($http, $veri) {
    http_response_code($http);
    echo json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function hata($http, $kod, $mesaj, $ek = []) {
    yanit($http, array_merge(['ok' => false, 'hata' => ['kod' => $kod, 'mesaj' => $mesaj]], $ek));
}

function yetkilendir() {
    global $EMEKLI_API_KEY;
    if (!is_string($EMEKLI_API_KEY) || strlen($EMEKLI_API_KEY) < 16) {
        error_log('emekli api: EMEKLI_API_KEY tanimli degil');
        hata(503, 'sunucu_yapilandirmasi_eksik', 'Sunucu yapılandırması eksik.');
    }
    $gelen = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if (!is_string($gelen) || $gelen === '' || !hash_equals($EMEKLI_API_KEY, $gelen)) {
        usleep(300000); // kaba kuvveti yavaşlat
        header('WWW-Authenticate: ApiKey realm="emekli-robot"');
        hata(401, 'yetkisiz', 'Geçersiz veya eksik X-Api-Key.');
    }
}

function db() {
    global $DB;
    try {
        $dsn = 'mysql:host=' . $DB['host'] . ';port=' . (int)$DB['port'] . ';dbname=' . $DB['name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $DB['user'], $DB['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        return $pdo;
    } catch (Exception $e) {
        error_log('emekli api db: ' . $e->getMessage());
        hata(503, 'veritabani_hatasi', 'Veritabanına bağlanılamadı.');
    }
}

function iso_ayristir($s) {
    // Dönüş: [UTC 'Y-m-d H:i:s', ofset dk, epoch sn] veya null
    if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/', $s)) { return null; }
    $s = preg_replace('/\.\d+/', '', $s, 1);
    if (substr($s, -1) === 'Z') { $s = substr($s, 0, -1) . '+00:00'; }
    $d = DateTimeImmutable::createFromFormat('Y-m-d\TH:i:sP', $s);
    $e = DateTimeImmutable::getLastErrors();
    if (!$d || ($e && ($e['warning_count'] > 0 || $e['error_count'] > 0))) { return null; }
    if ((int)$d->format('Y') < 2000) { return null; }
    $utc = $d->setTimezone(new DateTimeZone('UTC'));
    return [$utc->format('Y-m-d H:i:s'), (int)($d->getOffset() / 60), $d->getTimestamp()];
}
