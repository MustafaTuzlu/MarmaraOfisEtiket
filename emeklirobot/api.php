<?php
// GET /emeklirobot/api.php : panel verisi (yalnızca oturum açmışsa)
require __DIR__ . '/_ortak.php';
oturum_baslat();
header('Content-Type: application/json; charset=utf-8');

function cikis($http, $veri) { http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE); exit; }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
session_write_close();

function utc_param($s) {
    if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/', $s)) { return null; }
    try { $d = new DateTimeImmutable($s); } catch (Exception $e) { return null; }
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
function sayi($k) {
    if (!isset($_GET[$k]) || $_GET[$k] === '' || !is_numeric($_GET[$k])) { return null; }
    return (float)$_GET[$k];
}
function liste($k, $re) {
    if (empty($_GET[$k]) || !is_string($_GET[$k])) { return []; }
    $out = [];
    foreach (explode(',', $_GET[$k]) as $v) {
        $v = trim($v);
        if (preg_match($re, $v)) { $out[] = $v; }
        if (count($out) >= 30) { break; }
    }
    return $out;
}
function iso($dt) { return $dt === null ? null : str_replace(' ', 'T', $dt) . 'Z'; }
function bo($v) { return $v === null ? null : ((int)$v === 1); }
function fl($v) { return $v === null ? null : (float)$v; }
function satir($r) {
    return [
        'id' => (int)$r['id'],
        'kayit' => $r['kayit'],
        'cihazAdi' => $r['cihaz_adi'],
        'logTipi' => $r['log_tipi'],
        'enlem' => fl($r['enlem']),
        'boylam' => fl($r['boylam']),
        'dogruluk' => fl($r['dogruluk_m']),
        'hizKmh' => fl($r['hiz_kmh']),
        'yon' => fl($r['yon']),
        'pilYuzdesi' => $r['pil_yuzdesi'] === null ? null : (int)$r['pil_yuzdesi'],
        'sarjdaMi' => bo($r['sarjda_mi']),
        'pilSicakligi' => fl($r['pil_sicakligi']),
        'aracHareketli' => bo($r['arac_hareketli']),
        'zaman' => iso($r['zaman']),
        'konumZamani' => iso($r['konum_zamani']),
        'konumZamaniOfsetDk' => (int)$r['konum_zamani_ofset_dk'],
        'elapsedRealtime' => (int)$r['elapsed_realtime_ms'],
        'konumYasiMs' => $r['konum_yasi_ms'] === null ? null : (int)$r['konum_yasi_ms'],
        'duzeltilmisZaman' => iso($r['duzeltilmis_zaman']),
        'zamanKaynagi' => $r['zaman_kaynagi'],
        'alinmaZamani' => iso($r['alinma_zamani']),
    ];
}

$ZAMAN = 'COALESCE(duzeltilmis_zaman, konum_zamani)';
$w = []; $p = []; // tarih dışındaki filtreler (hızlı buton sayaçları bunları kullanır)
$wt = []; $pt = []; // tarih aralığı

if (($v = utc_param($_GET['bas'] ?? null)) !== null) { $wt[] = "$ZAMAN >= ?"; $pt[] = $v; }
if (($v = utc_param($_GET['bit'] ?? null)) !== null) { $wt[] = "$ZAMAN <= ?"; $pt[] = $v; }
if ($t = liste('tip', '/^[A-Z_]{1,30}$/')) { $w[] = 'log_tipi IN (' . implode(',', array_fill(0, count($t), '?')) . ')'; $p = array_merge($p, $t); }
if ($t = liste('cihaz', '/^[A-Za-z0-9_-]{1,50}$/')) { $w[] = 'cihaz_adi IN (' . implode(',', array_fill(0, count($t), '?')) . ')'; $p = array_merge($p, $t); }
$h = $_GET['hareket'] ?? '';
if ($h === 'hareket') { $w[] = 'arac_hareketli = 1'; } elseif ($h === 'duragan') { $w[] = 'arac_hareketli = 0'; }
$s = $_GET['sarj'] ?? '';
if ($s === 'evet') { $w[] = 'sarjda_mi = 1'; } elseif ($s === 'hayir') { $w[] = 'sarjda_mi = 0'; }
foreach ([['pilMin', 'pil_yuzdesi >= ?'], ['pilMax', 'pil_yuzdesi <= ?'], ['sicMin', 'pil_sicakligi >= ?'], ['sicMax', 'pil_sicakligi <= ?'], ['dogMax', 'dogruluk_m <= ?']] as $f) {
    if (($v = sayi($f[0])) !== null) { $w[] = $f[1]; $p[] = $v; }
}
if (($_GET['konumlu'] ?? '') === '1') { $w[] = 'enlem IS NOT NULL'; }

$limit = (int)($_GET['limit'] ?? 250);
if (!in_array($limit, [100, 250, 500, 1000], true)) { $limit = 250; }

// "Analiz et": filtreye uyan TÜM kayıtlar (liste limiti uygulanmaz). Önce satır sayısı bilinir; sınır üstünde veri hiç çekilmez.
// analiz=say -> yalnızca sayı; analiz=veri -> küçük diziler (bellek ve aktarım için kolon adları tekrarlanmaz; sıra app tarafında analiz-ui.js ile aynı olmalı)
const ANALIZ_SINIR = 20000;
$analiz = $_GET['analiz'] ?? '';
if ($analiz === 'say' || $analiz === 'veri') {
    $aw = array_merge($wt, $w); $ap = array_merge($pt, $p);
    $ak = $aw ? 'WHERE ' . implode(' AND ', $aw) : '';
    try {
        $pdo = db();
        $st = $pdo->prepare('SELECT COUNT(*) FROM emekli_log ' . $ak);
        $st->execute($ap);
        $toplam = (int)$st->fetchColumn();
        $cikti = ['ok' => true, 'toplam' => $toplam, 'sinir' => ANALIZ_SINIR, 'sunucuZamani' => gmdate('Y-m-d\TH:i:s\Z')];
        if ($analiz === 'veri' && $toplam <= ANALIZ_SINIR) {
            $st = $pdo->prepare("SELECT cihaz_adi, log_tipi, $ZAMAN AS zaman, enlem, boylam, dogruluk_m, hiz_kmh, pil_yuzdesi, sarjda_mi, pil_sicakligi, arac_hareketli, alinma_zamani, konum_yasi_ms "
                . "FROM emekli_log $ak ORDER BY zaman ASC, id ASC LIMIT " . ANALIZ_SINIR);
            $st->execute($ap);
            $satirlar = [];
            while ($r = $st->fetch(PDO::FETCH_NUM)) {
                $satirlar[] = [
                    $r[0], $r[1], strtotime($r[2] . ' UTC'), fl($r[3]), fl($r[4]), fl($r[5]), fl($r[6]),
                    $r[7] === null ? null : (int)$r[7], $r[8] === null ? null : (int)$r[8], fl($r[9]),
                    $r[10] === null ? null : (int)$r[10], strtotime($r[11] . ' UTC'), $r[12] === null ? null : (int)$r[12],
                ];
            }
            $cikti['satirlar'] = $satirlar;
        }
        cikis(200, $cikti);
    } catch (Exception $e) {
        error_log('emeklirobot analiz: ' . $e->getMessage());
        cikis(500, ['ok' => false, 'hata' => 'sunucu']);
    }
}

$kosulHizli = $w ? 'WHERE ' . implode(' AND ', $w) : '';
$pHizli = $p;
$w = array_merge($wt, $w); $p = array_merge($pt, $p);
$kosul = $w ? 'WHERE ' . implode(' AND ', $w) : '';

// Hızlı buton başlangıçları: panel Başlangıç alanını dakika hassasiyetinde doldurduğu için dakikaya yuvarlanır; "Bugün" = Türkiye (UTC+3) 00:00
$simdiDk = time() - time() % 60;
$araliklar = [
    'dk15' => $simdiDk - 900, 'dk20' => $simdiDk - 1200, 's1' => $simdiDk - 3600, 's6' => $simdiDk - 21600,
    's24' => $simdiDk - 86400, 's168' => $simdiDk - 604800, 'bugun' => $simdiDk - ($simdiDk + 10800) % 86400,
];
$kolon = 'id, kayit, cihaz_adi, log_tipi, enlem, boylam, dogruluk_m, hiz_kmh, yon, pil_yuzdesi, sarjda_mi, pil_sicakligi, arac_hareketli, '
       . 'konum_zamani, konum_zamani_ofset_dk, elapsed_realtime_ms, konum_yasi_ms, duzeltilmis_zaman, zaman_kaynagi, alinma_zamani, ' . $ZAMAN . ' AS zaman';

try {
    $pdo = db();
    $st = $pdo->prepare("SELECT $kolon FROM emekli_log $kosul ORDER BY zaman DESC, id DESC LIMIT $limit");
    $st->execute($p);
    $kayitlar = array_map('satir', $st->fetchAll(PDO::FETCH_ASSOC));

    $st = $pdo->prepare('SELECT COUNT(*) FROM emekli_log ' . $kosul);
    $st->execute($p);
    $toplam = (int)$st->fetchColumn();

    $kosulKonum = $kosul === '' ? 'WHERE enlem IS NOT NULL' : $kosul . ' AND enlem IS NOT NULL';
    $st = $pdo->prepare("SELECT $kolon FROM emekli_log $kosulKonum ORDER BY zaman DESC, id DESC LIMIT 1");
    $st->execute($p);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    $sonKonum = $r ? satir($r) : null;

    // Her hızlı butonun kaç kayıt getireceği (tek sorgu)
    $sec = []; $ph = [];
    foreach ($araliklar as $ad => $t0) { $sec[] = "SUM($ZAMAN >= ?) AS $ad"; $ph[] = gmdate('Y-m-d H:i:s', $t0); }
    $st = $pdo->prepare('SELECT ' . implode(', ', $sec) . ' FROM emekli_log ' . $kosulHizli);
    $st->execute(array_merge($ph, $pHizli));
    $hizli = array_map('intval', $st->fetch(PDO::FETCH_ASSOC));

    $cikti = ['ok' => true, 'toplam' => $toplam, 'kayitlar' => $kayitlar, 'sonKonum' => $sonKonum, 'hizli' => $hizli, 'sunucuZamani' => gmdate('Y-m-d\TH:i:s\Z')];
    if (($_GET['secenek'] ?? '') === '1') {
        $cikti['tipler'] = $pdo->query('SELECT DISTINCT log_tipi FROM emekli_log ORDER BY log_tipi')->fetchAll(PDO::FETCH_COLUMN);
        $cikti['cihazlar'] = $pdo->query('SELECT DISTINCT cihaz_adi FROM emekli_log ORDER BY cihaz_adi')->fetchAll(PDO::FETCH_COLUMN);
    }
    cikis(200, $cikti);
} catch (Exception $e) {
    error_log('emeklirobot panel: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
