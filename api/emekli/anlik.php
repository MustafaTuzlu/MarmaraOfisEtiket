<?php
// POST /api/emekli/anlik.php -> telefonun anlık durumu (komuta cevap). Log tablosuna GİRMEZ.
// Sözleşme: docs/emekli-robot-api.md (v1.1)
require __DIR__ . '/_ortak.php';

const MAX_GOVDE = 65536;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    hata(405, 'yontem_desteklenmiyor', 'Yalnızca POST kullanın.');
}
yetkilendir();

if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    hata(415, 'icerik_tipi_desteklenmiyor', 'Content-Type: application/json gerekli.');
}
$ham = file_get_contents('php://input', false, null, 0, MAX_GOVDE + 1);
if ($ham === false || $ham === '') { hata(400, 'bos_govde', 'İstek gövdesi boş.'); }
if (strlen($ham) > MAX_GOVDE) { hata(413, 'govde_cok_buyuk', 'İstek gövdesi 64 KB sınırını aşıyor.'); }
$veri = json_decode($ham, true);
if (!is_array($veri)) { hata(400, 'gecersiz_json', 'Gövde geçerli bir JSON nesnesi değil.'); }

$hatalar = [];
$h = function ($alan, $neden) use (&$hatalar) { $hatalar[] = ['alan' => $alan, 'neden' => $neden]; };

$komutId = $veri['komutId'] ?? null;
if ($komutId !== null && (!is_int($komutId) || $komutId < 1)) { $h('komutId', 'pozitif tamsayı veya null'); }
$cihaz = $veri['cihazAdi'] ?? null;
if (!is_string($cihaz) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $cihaz)) { $h('cihazAdi', '1-50 karakter, yalnızca A-Z a-z 0-9 _ -'); }
$ger = $veri['gonderimElapsedRealtime'] ?? null;
if ($ger !== null && (!is_int($ger) || $ger < 0)) { $h('gonderimElapsedRealtime', 'ms cinsinden tamsayı >= 0 veya null'); }
$a = $veri['anlik'] ?? null;
if (!is_array($a) || ($a !== [] && array_keys($a) === range(0, count($a) - 1))) {
    $h('anlik', 'nesne olmalı');
    $a = [];
}

$say = function ($k, $min, $max) use (&$a, $h) {
    $v = $a[$k] ?? null;
    if ($v === null) { return null; }
    if (!(is_int($v) || is_float($v)) || $v < $min || $v > $max) { $h("anlik.$k", "$min..$max arası sayı veya null"); return null; }
    return $v;
};
$tam = function ($k, $min, $max) use (&$a, $h) {
    $v = $a[$k] ?? null;
    if ($v === null) { return null; }
    if (!is_int($v) || $v < $min || $v > $max) { $h("anlik.$k", "$min..$max arası tamsayı veya null"); return null; }
    return $v;
};
$bool = function ($k) use (&$a, $h) {
    $v = $a[$k] ?? null;
    if ($v === null) { return null; }
    if (!is_bool($v)) { $h("anlik.$k", 'bool veya null'); return null; }
    return $v;
};
$yazi = function ($k, $max) use (&$a, $h) {
    $v = $a[$k] ?? null;
    if ($v === null) { return null; }
    if (!is_string($v)) { $h("anlik.$k", 'metin veya null'); return null; }
    return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max);
};
$iso = function ($k, $zorunlu) use (&$a, $h) {
    $v = $a[$k] ?? null;
    if ($v === null) { if ($zorunlu) { $h("anlik.$k", 'zorunlu (saat dilimli ISO 8601)'); } return null; }
    if (iso_ayristir($v) === null) { $h("anlik.$k", 'saat dilimli ISO 8601 olmalı'); return null; }
    return $v;
};

$enlem = $say('enlem', -90, 90);
$boylam = $say('boylam', -180, 180);
if (($enlem === null) !== ($boylam === null)) { $h('anlik.enlem', 'enlem ve boylam birlikte dolu ya da birlikte null olmalı'); }
$termal = $a['termal'] ?? null;
if ($termal !== null && !(is_string($termal) && in_array($termal, ['NORMAL', 'ISINMIS', 'KRITIK'], true))) { $h('anlik.termal', 'NORMAL | ISINMIS | KRITIK veya null'); $termal = null; }

$temiz = [
    'surum' => $yazi('surum', 50),
    'anlikZamani' => $iso('anlikZamani', true),
    'enlem' => $enlem, 'boylam' => $boylam,
    'dogruluk' => $say('dogruluk', 0, 1000000),
    'konumYasiMs' => $tam('konumYasiMs', 0, PHP_INT_MAX),
    'hizKmh' => $say('hizKmh', 0, 400),
    'yon' => $say('yon', 0, 359.99),
    'pilYuzdesi' => $tam('pilYuzdesi', 0, 100),
    'sarjdaMi' => $bool('sarjdaMi'),
    'pilSicakligi' => $say('pilSicakligi', -50, 150),
    'aracHareketli' => $bool('aracHareketli'),
    'termal' => $termal,
    'gpsModu' => $yazi('gpsModu', 50),
    'bekleyenKayit' => $tam('bekleyenKayit', 0, PHP_INT_MAX),
    'sonGonderimZamani' => $iso('sonGonderimZamani', false),
    'hareketSensoru' => $bool('hareketSensoru'),
    'sensorTetiklenme' => $tam('sensorTetiklenme', 0, PHP_INT_MAX),
    'reddedilenKonum' => $tam('reddedilenKonum', 0, PHP_INT_MAX),
    'sonCokme' => $yazi('sonCokme', 300),
];

if ($hatalar) { hata(422, 'gecersiz_anlik', count($hatalar) . ' hata bulundu; kaydedilmedi.', ['hatalar' => $hatalar]); }

$simdi = gmdate('Y-m-d H:i:s');
$json = json_encode($temiz, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) { hata(422, 'gecersiz_anlik', 'Metin alanları geçerli UTF-8 değil.'); }

$pdo = db();
try {
    $pdo->beginTransaction();
    // Cihaz başına tek satır: son anlık durum (komut bilinmese / zaman aşımına uğramış olsa da yazılır)
    $st = $pdo->prepare('INSERT INTO cihaz_anlik (cihaz_adi, veri, komut_id, alinma_zamani) VALUES (?, ?, ?, ?) '
        . 'ON DUPLICATE KEY UPDATE veri = VALUES(veri), komut_id = VALUES(komut_id), alinma_zamani = VALUES(alinma_zamani)');
    $st->execute([$cihaz, $json, $komutId, $simdi]);
    if ($komutId !== null) {
        // Yalnızca bu cihazın hâlâ bekleyen komutunu TAMAM yap; tekrar gelen / bilinmeyen id sessizce geçilir.
        $st = $pdo->prepare("UPDATE emekli_komut SET durum = 'TAMAM', bekleyen = NULL, tamamlanma = ? WHERE id = ? AND cihaz_adi = ? AND bekleyen = 1");
        $st->execute([$simdi, $komutId, $cihaz]);
    }
    $pdo->commit();
} catch (Exception $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    error_log('emekli anlik: ' . $e->getMessage());
    hata(500, 'sunucu_hatasi', 'Anlık durum yazılamadı; yeniden gönderilebilir.');
}

yanit(200, ['ok' => true]);
