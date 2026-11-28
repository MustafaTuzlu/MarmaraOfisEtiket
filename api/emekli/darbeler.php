<?php
// POST /api/emekli/darbeler.php -> darbe adayı özeti + GPS izi (istek başına tek olay; aynı id güncellenir).
// Log tablosuna GİRMEZ. Sözleşme: docs/emekli-robot-api.md §14 (v1.3). PHP 7.0+ uyumlu.
require __DIR__ . '/_ortak.php';

const MAX_GOVDE = 131072; // 128 KB
const MAX_NOKTA = 400;
const ASAMALAR = ['OZET' => 1, 'DALGA' => 2, 'TAMAM' => 3];
const ETIKETLER = ['OLASI_DARBE', 'TELEFON_DUSMESI_SUPHESI', 'BELIRLENEMEDI'];
const DURUMLAR = ['KASIS_CUKUR', 'SERT_FREN', 'KAPI', 'TELEFON', 'CARPISMA', 'BILINMIYOR'];

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
if (strlen($ham) > MAX_GOVDE) { hata(413, 'govde_cok_buyuk', 'İstek gövdesi 128 KB sınırını aşıyor.'); }
$g = json_decode($ham, true);
if (!is_array($g)) { hata(400, 'gecersiz_json', 'Gövde geçerli bir JSON nesnesi değil.'); }

$hatalar = [];
$h = function ($alan, $neden) use (&$hatalar) {
    if (count($hatalar) < 20) { $hatalar[] = ['alan' => $alan, 'neden' => $neden]; }
};
$sayiMi = function ($v, $min, $max) { return (is_int($v) || is_float($v)) && $v >= $min && $v <= $max; };
$say = function ($k, $min, $max) use ($g, $h, $sayiMi) {
    $v = $g[$k] ?? null;
    if ($v === null) { return null; }
    if (!$sayiMi($v, $min, $max)) { $h($k, "$min..$max arası sayı veya null"); return null; }
    return $v;
};
$tam = function ($k, $min, $max) use ($g, $h) {
    $v = $g[$k] ?? null;
    if ($v === null) { return null; }
    if (!is_int($v) || $v < $min || $v > $max) { $h($k, "$min..$max arası tamsayı veya null"); return null; }
    return $v;
};
$bool = function ($k) use ($g, $h) {
    $v = $g[$k] ?? null;
    if ($v === null) { return null; }
    if (!is_bool($v)) { $h($k, 'bool veya null'); return null; }
    return $v;
};
// Uzun metin reddedilmez, kesilir (telefondaki kayıt takılıp kalmasın)
$yazi = function ($k, $max) use ($g, $h) {
    $v = $g[$k] ?? null;
    if ($v === null) { return null; }
    if (!is_string($v)) { $h($k, 'metin veya null'); return null; }
    if (function_exists('mb_substr')) { return mb_substr($v, 0, $max, 'UTF-8'); }
    return preg_match('/^.{0,' . (int)$max . '}/us', $v, $m) ? $m[0] : '';
};

$uuid = $g['id'] ?? null;
if (!is_string($uuid) || !preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/D', $uuid)) { $h('id', 'geçerli UUID değil'); }
$cihaz = $g['cihazAdi'] ?? null;
if (!is_string($cihaz) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/D', $cihaz)) { $h('cihazAdi', '1-50 karakter, yalnızca A-Z a-z 0-9 _ -'); }
$zaman = iso_ayristir($g['zaman'] ?? null);
if ($zaman === null) { $h('zaman', 'saat dilimli ISO 8601 olmalı'); }
$asama = $g['asama'] ?? null;
if (!is_string($asama) || !array_key_exists($asama, ASAMALAR)) { $h('asama', 'OZET | DALGA | TAMAM'); }
$etiket = $g['etiket'] ?? null;
if (!is_string($etiket) || !in_array($etiket, ETIKETLER, true)) { $h('etiket', implode(' | ', ETIKETLER)); }
$tetikleme = $g['tetikleme'] ?? null;
if (!is_int($tetikleme) || $tetikleme < 1 || $tetikleme > 100000) { $h('tetikleme', '1..100000 tamsayı'); }
$tepe = $g['tepeG'] ?? null;
if (!$sayiMi($tepe, 0, 1000)) { $h('tepeG', '0..1000 arası sayı'); }
$gercek = $g['gercekDurum'] ?? null;
if ($gercek !== null && !(is_string($gercek) && in_array($gercek, DURUMLAR, true))) { $h('gercekDurum', implode(' | ', DURUMLAR) . ' veya null'); $gercek = null; }

$ozet = [
    'uygulama' => $yazi('uygulama', 20),
    'tetikleme' => $tetikleme,
    'sureMs' => $say('sureMs', 0, 600000),
    'deltaVKmh' => $say('deltaVKmh', 0, 1000),
    'tekOrnek' => $bool('tekOrnek'),
    'doymus' => $bool('doymus'),
    'serbestDususMs' => $say('serbestDususMs', 0, 600000),
    'enYuksekAcisalHizDps' => $say('enYuksekAcisalHizDps', 0, 100000),
    'yonDegisimiDerece' => $say('yonDegisimiDerece', -100000, 100000),
    'basincDegisimiHpa' => $say('basincDegisimiHpa', -1200, 1200),
    'hizOnceKmh' => $say('hizOnceKmh', 0, 400),
    'hiz10Kmh' => $say('hiz10Kmh', 0, 400),
    'hiz60Kmh' => $say('hiz60Kmh', 0, 400),
    'hiz120Kmh' => $say('hiz120Kmh', 0, 400),
    'belirginHizKaybi' => $bool('belirginHizKaybi'),
    'sensor' => $yazi('sensor', 500),
    'not' => $yazi('not', 500),
    'tepeFarkMs' => $tam('tepeFarkMs', 0, 3600000),
];
$er = $tam('elapsedRealtime', 0, PHP_INT_MAX);
$ger = $tam('gonderimElapsedRealtime', 0, PHP_INT_MAX);
$gz = null;
if (isset($g['gonderimZamani'])) {
    $gz = iso_ayristir($g['gonderimZamani']);
    if ($gz === null) { $h('gonderimZamani', 'saat dilimli ISO 8601 olmalı'); }
}

$noktalar = [];
$gps = $g['gps'] ?? null;
if (!is_array($gps) || ($gps !== [] && array_keys($gps) !== range(0, count($gps) - 1))) {
    $h('gps', 'dizi olmalı (GPS yoksa [])');
} elseif (count($gps) > MAX_NOKTA) {
    $h('gps', 'en çok ' . MAX_NOKTA . ' nokta');
} else {
    foreach ($gps as $i => $n) {
        if (!is_array($n)) { $h("gps.$i", 'nesne olmalı'); continue; }
        $once = count($hatalar);
        $t = $n['tMs'] ?? null;
        if (!is_int($t) || $t < -3600000 || $t > 3600000) { $h("gps.$i.tMs", '-3600000..3600000 tamsayı'); }
        if (!$sayiMi($n['enlem'] ?? null, -90, 90)) { $h("gps.$i.enlem", '-90..90 sayı'); }
        if (!$sayiMi($n['boylam'] ?? null, -180, 180)) { $h("gps.$i.boylam", '-180..180 sayı'); }
        foreach (['hizKmh' => 400, 'yon' => 360, 'dogruluk' => 1000000] as $alan => $ust) {
            if (isset($n[$alan]) && !$sayiMi($n[$alan], 0, $ust)) { $h("gps.$i.$alan", "0..$ust sayı veya null"); }
        }
        if (isset($n['uydu']) && (!is_int($n['uydu']) || $n['uydu'] < 0 || $n['uydu'] > 200)) { $h("gps.$i.uydu", '0..200 tamsayı veya null'); }
        if (isset($n['reddedildi']) && !is_bool($n['reddedildi'])) { $h("gps.$i.reddedildi", 'bool veya null'); }
        if (count($hatalar) > $once || $once >= 20) { continue; }
        $noktalar[] = [$t, round((float)$n['enlem'], 7), round((float)$n['boylam'], 7),
            isset($n['hizKmh']) ? round((float)$n['hizKmh'], 1) : null, isset($n['yon']) ? round((float)$n['yon'], 1) : null,
            isset($n['dogruluk']) ? round((float)$n['dogruluk'], 1) : null, $n['uydu'] ?? null, empty($n['reddedildi']) ? 0 : 1];
    }
}

if ($hatalar) { hata(422, 'gecersiz_darbe', count($hatalar) . ' hata bulundu; kaydedilmedi.', ['hatalar' => $hatalar]); }

$veriJson = json_encode($ozet, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$gpsJson = json_encode($noktalar);
if ($veriJson === false || $gpsJson === false) { hata(422, 'gecersiz_darbe', 'Metin alanları geçerli UTF-8 değil.', ['hatalar' => []]); }

// Saat düzeltmesi (§7 ile aynı kural); yalnız ilk eklemede yazılır
$simdi = time();
$duz = null; $kaynak = 'YOK';
$fark = ($er !== null && $ger !== null) ? $ger - $er : -1;
if ($fark >= 0 && $fark <= 90 * 86400 * 1000) {
    $duz = gmdate('Y-m-d H:i:s', $simdi - intdiv($fark, 1000));
    $kaynak = 'ELAPSED';
} elseif ($gz !== null) {
    $duz = gmdate('Y-m-d H:i:s', $zaman[2] + ($simdi - $gz[2]));
    $kaynak = 'CIHAZ';
}

$uuid = strtolower($uuid);
$alinma = gmdate('Y-m-d H:i:s', $simdi);
$guncel = [$cihaz, $zaman[0], $zaman[1], $asama, $etiket, $gercek, (float)$tepe, $veriJson, $gpsJson, count($noktalar), $alinma];

$pdo = db();
try {
    $pdo->beginTransaction();
    // Aynı olayın eşzamanlı ilk gönderimi UNIQUE(uuid) ile tek satıra düşer; sonra satır kilitlenip aşama karşılaştırılır
    $st = $pdo->prepare('INSERT IGNORE INTO emekli_darbe (uuid, cihaz_adi, zaman, zaman_ofset_dk, asama, etiket, gercek_durum, tepe_g, veri, gps, gps_adet, son_alinma, ilk_alinma, duzeltilmis_zaman, zaman_kaynagi) '
        . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $st->execute(array_merge([$uuid], $guncel, [$alinma, $duz, $kaynak]));
    if ($st->rowCount() === 1) {
        $sonuc = 'eklendi';
    } else {
        $st = $pdo->prepare('SELECT asama FROM emekli_darbe WHERE uuid = ? FOR UPDATE');
        $st->execute([$uuid]);
        $eski = $st->fetchColumn();
        if ($eski === false) { throw new RuntimeException('satır eklenemedi'); }
        if (array_key_exists($eski, ASAMALAR) && ASAMALAR[$asama] < ASAMALAR[$eski]) {
            $sonuc = 'yoksayildi';
        } else {
            $st = $pdo->prepare('UPDATE emekli_darbe SET cihaz_adi = ?, zaman = ?, zaman_ofset_dk = ?, asama = ?, etiket = ?, gercek_durum = ?, tepe_g = ?, veri = ?, gps = ?, gps_adet = ?, son_alinma = ? WHERE uuid = ?');
            $st->execute(array_merge($guncel, [$uuid]));
            $sonuc = 'guncellendi';
        }
    }
    $pdo->commit();
} catch (Exception $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    if ($e instanceof PDOException && (string)$e->getCode() === '42S02') {
        hata(503, 'tablo_yok', 'Darbe tablosu henüz oluşturulmamış.');
    }
    error_log('emekli darbeler: ' . $e->getMessage());
    hata(500, 'sunucu_hatasi', 'Olay yazılamadı; yeniden gönderilebilir.');
}

yanit(200, ['ok' => true, 'sonuc' => $sonuc, 'sunucuZamani' => gmdate('Y-m-d\TH:i:s', $simdi) . 'Z']);
