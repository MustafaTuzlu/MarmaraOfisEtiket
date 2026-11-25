<?php
// POST /api/emekli/kayitlar.php -> toplu log kabulü (idempotent, hep-ya-da-hiç)
// Sözleşme: docs/emekli-robot-api.md
require __DIR__ . '/_ortak.php';

const MAX_PARTI = 500;
const MAX_GOVDE = 2097152; // 2 MB
const LOG_TIPLERI = [
    'SARJ_BASLADI', 'SARJ_KESILDI', 'ARAC_HAREKET', 'ARAC_DURUYOR', 'KONUM', 'DURUM',
    'KONUM_ALINAMADI', 'CIHAZ_ISINDI', 'CIHAZ_KRITIK_ISINDI', 'CIHAZ_SOGUDU',
];

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
if (strlen($ham) > MAX_GOVDE) { hata(413, 'govde_cok_buyuk', 'İstek gövdesi 2 MB sınırını aşıyor.'); }

$veri = json_decode($ham, true);
if (!is_array($veri)) { hata(400, 'gecersiz_json', 'Gövde geçerli bir JSON nesnesi değil.'); }

$liste = $veri['kayitlar'] ?? null;
if (!is_array($liste) || ($liste !== [] && array_keys($liste) !== range(0, count($liste) - 1))) {
    hata(400, 'gecersiz_zarf', '"kayitlar" bir dizi olmalı.');
}
if (count($liste) === 0) { hata(400, 'bos_parti', '"kayitlar" boş olamaz.'); }
if (count($liste) > MAX_PARTI) { hata(413, 'parti_cok_buyuk', 'Bir partide en fazla ' . MAX_PARTI . ' kayıt olabilir.'); }

$gonderimER = $veri['gonderimElapsedRealtime'] ?? null;
if (!is_int($gonderimER) || $gonderimER < 0) {
    hata(400, 'gecersiz_zarf', '"gonderimElapsedRealtime" (ms, tamsayı >= 0) zorunlu.');
}
$simdi = time(); // sunucu UTC epoch (sn)

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

$gonderimZ = isset($veri['gonderimZamani']) ? iso_ayristir($veri['gonderimZamani']) : null;

$satirlar = [];
$hatalar = [];
foreach ($liste as $i => $k) {
    $h = function ($alan, $neden) use (&$hatalar, $i, $k) {
        $hatalar[] = ['sira' => $i, 'kayit' => (is_array($k) && isset($k['kayit']) && is_string($k['kayit'])) ? $k['kayit'] : null, 'alan' => $alan, 'neden' => $neden];
    };
    if (!is_array($k)) { $h('kayit', 'kayıt bir nesne olmalı'); continue; }
    $n = count($hatalar);

    $uuid = $k['kayit'] ?? null;
    if (!is_string($uuid) || !preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $uuid)) { $h('kayit', 'geçerli UUID değil'); }
    $cihaz = $k['cihazAdi'] ?? null;
    if (!is_string($cihaz) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $cihaz)) { $h('cihazAdi', '1-50 karakter, yalnızca A-Z a-z 0-9 _ -'); }
    $tip = $k['logTipi'] ?? null;
    if (!is_string($tip) || !in_array($tip, LOG_TIPLERI, true)) { $h('logTipi', 'bilinmeyen log tipi'); }

    $enlem = $k['enlem'] ?? null;
    $boylam = $k['boylam'] ?? null;
    if (($enlem === null) !== ($boylam === null)) { $h('enlem', 'enlem ve boylam birlikte dolu ya da birlikte null olmalı'); }
    elseif ($enlem !== null) {
        if (!(is_int($enlem) || is_float($enlem)) || $enlem < -90 || $enlem > 90) { $h('enlem', '-90..90 aralığında sayı olmalı'); }
        if (!(is_int($boylam) || is_float($boylam)) || $boylam < -180 || $boylam > 180) { $h('boylam', '-180..180 aralığında sayı olmalı'); }
    }
    $dog = $k['dogruluk'] ?? null;
    if ($dog !== null && (!(is_int($dog) || is_float($dog)) || $dog < 0 || $dog > 1000000)) { $h('dogruluk', '0..1000000 arası sayı (m) veya null'); }
    $hiz = $k['hizKmh'] ?? null;
    if ($hiz !== null && (!(is_int($hiz) || is_float($hiz)) || $hiz < 0 || $hiz > 400)) { $h('hizKmh', '0..400 arası sayı (km/h) veya null'); }
    $yon = $k['yon'] ?? null;
    if ($yon !== null && (!(is_int($yon) || is_float($yon)) || $yon < 0 || $yon >= 360)) { $h('yon', '0..359.9 arası sayı (derece) veya null'); }
    $pil = $k['pilYuzdesi'] ?? null;
    if ($pil !== null && (!is_int($pil) || $pil < 0 || $pil > 100)) { $h('pilYuzdesi', '0..100 tamsayı veya null'); }
    $sarj = $k['sarjdaMi'] ?? null;
    if ($sarj !== null && !is_bool($sarj)) { $h('sarjdaMi', 'bool veya null'); }
    $sic = $k['pilSicakligi'] ?? null;
    if ($sic !== null && (!(is_int($sic) || is_float($sic)) || $sic < -50 || $sic > 150)) { $h('pilSicakligi', '-50..150 arası sayı (C) veya null'); }
    $hrk = $k['aracHareketli'] ?? null;
    if ($hrk !== null && !is_bool($hrk)) { $h('aracHareketli', 'bool veya null'); }
    $kz = iso_ayristir($k['konumZamani'] ?? null);
    if ($kz === null) { $h('konumZamani', 'saat dilimli ISO 8601 olmalı, örn. 2026-11-25T14:03:07+03:00'); }
    $er = $k['elapsedRealtime'] ?? null;
    if (!is_int($er) || $er < 0) { $h('elapsedRealtime', 'ms cinsinden tamsayı >= 0 olmalı'); }
    $ky = $k['konumYasiMs'] ?? null;
    if ($ky !== null && (!is_int($ky) || $ky < 0)) { $h('konumYasiMs', 'ms cinsinden tamsayı >= 0 veya null'); }

    if (count($hatalar) > $n) { continue; }

    // Saat sapması düzeltmesi
    $duz = null; $kaynak = 'YOK';
    $fark = $gonderimER - $er; // bu kayıt, gönderimden kaç ms önce oluştu (aynı açılışta)
    if ($fark >= 0 && $fark <= 90 * 86400 * 1000) {
        $duz = gmdate('Y-m-d H:i:s', $simdi - intdiv($fark, 1000));
        $kaynak = 'ELAPSED';
    } elseif ($gonderimZ !== null) { // cihaz yeniden başlamış: sabit saat farkı varsay
        $duz = gmdate('Y-m-d H:i:s', $kz[2] + ($simdi - $gonderimZ[2]));
        $kaynak = 'CIHAZ';
    }

    $satirlar[] = [
        strtolower($uuid), $cihaz, $tip,
        $enlem === null ? null : round((float)$enlem, 7), $boylam === null ? null : round((float)$boylam, 7),
        $dog === null ? null : round((float)$dog, 2),
        $hiz === null ? null : round((float)$hiz, 1), $yon === null ? null : fmod(round((float)$yon, 1), 360.0),
        $pil,
        $sarj === null ? null : (int)$sarj, $sic === null ? null : round((float)$sic, 1),
        $hrk === null ? null : (int)$hrk,
        $kz[0], $kz[1], $er, $ky, $duz, $kaynak, gmdate('Y-m-d H:i:s', $simdi),
    ];
}

if ($hatalar) {
    // Hiçbir kayıt yazılmaz. Telefon listelenen kayıtları ayıklayıp (karantina/sil) kalanı yeniden gönderir.
    hata(422, 'gecersiz_kayit', count($hatalar) . ' hata bulundu; parti kaydedilmedi.', ['hatalar' => $hatalar]);
}

$pdo = db();
try {
    $kolon = '(kayit, cihaz_adi, log_tipi, enlem, boylam, dogruluk_m, hiz_kmh, yon, pil_yuzdesi, sarjda_mi, pil_sicakligi, arac_hareketli, '
           . 'konum_zamani, konum_zamani_ofset_dk, elapsed_realtime_ms, konum_yasi_ms, duzeltilmis_zaman, zaman_kaynagi, alinma_zamani)';
    $yer = '(' . implode(',', array_fill(0, 19, '?')) . ')';
    $sql = 'INSERT IGNORE INTO emekli_log ' . $kolon . ' VALUES ' . implode(',', array_fill(0, count($satirlar), $yer));
    $param = [];
    foreach ($satirlar as $s) { foreach ($s as $v) { $param[] = $v; } }
    $pdo->beginTransaction();
    $st = $pdo->prepare($sql);
    $st->execute($param);
    $eklenen = $st->rowCount();
    $pdo->commit();
} catch (Exception $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    error_log('emekli kayitlar: ' . $e->getMessage());
    hata(500, 'sunucu_hatasi', 'Kayıtlar yazılamadı; tüm parti yeniden gönderilebilir.');
}

yanit(200, [
    'ok' => true,
    'alinan' => count($satirlar),
    'eklenen' => $eklenen,
    'tekrar' => count($satirlar) - $eklenen,
    'sunucuZamani' => gmdate('Y-m-d\TH:i:s', $simdi) . 'Z',
]);
