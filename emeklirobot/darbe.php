<?php
// Darbe adayları (panel): liste, tek olayın GPS izi (GET) ve tek kaydı silme (POST + CSRF). Yalnızca oturum. PHP 7.0+ uyumlu.
require __DIR__ . '/_ortak.php';
oturum_baslat();
header('Content-Type: application/json; charset=utf-8');

function cikis($http, $veri) { http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE); exit; }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
$csrf = (string)($_SESSION['csrf'] ?? '');
session_write_close();
$yontem = $_SERVER['REQUEST_METHOD'] ?? '';
if ($yontem !== 'GET' && $yontem !== 'POST') { header('Allow: GET, POST'); cikis(405, ['ok' => false, 'hata' => 'yontem']); }

// Tek kaydı kalıcı siler (liste satırındaki ×). Toplu silme yalnız Veritabanı Yönetimi'ndedir.
if ($yontem === 'POST') {
    if ($csrf === '' || !hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { cikis(403, ['ok' => false, 'hata' => 'csrf']); }
    $g = json_decode((string)file_get_contents('php://input', false, null, 0, 1024), true);
    $no = is_array($g) ? ($g['no'] ?? null) : null;
    if (!is_array($g) || ($g['islem'] ?? '') !== 'sil' || !is_int($no) || $no < 1) { cikis(400, ['ok' => false, 'hata' => 'girdi']); }
    try {
        $pdo = db();
        $st = $pdo->prepare('SELECT uuid, cihaz_adi, zaman FROM emekli_darbe WHERE id = ?');
        $st->execute([$no]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if (!$r) { cikis(404, ['ok' => false, 'hata' => 'yok']); }
        $pdo->prepare('DELETE FROM emekli_darbe WHERE id = ? LIMIT 1')->execute([$no]);
        $hedef = 'emekli_darbe / tek kayıt (' . $r['cihaz_adi'] . ', ' . $r['zaman'] . ' UTC, ' . $r['uuid'] . ')';
        $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
        error_log("emeklirobot db: sil $hedef ip=$ip");
        try {
            $pdo->prepare('INSERT INTO emekli_islem_log (zaman, islem, hedef, adet, ip) VALUES (?, ?, ?, ?, ?)')->execute([gmdate('Y-m-d H:i:s'), 'sil', $hedef, 1, $ip]);
        } catch (Exception $e) { error_log('emeklirobot darbe: islem log yazılamadı: ' . $e->getMessage()); }
        cikis(200, ['ok' => true]);
    } catch (Exception $e) {
        if ($e instanceof PDOException && (string)$e->getCode() === '42S02') { cikis(503, ['ok' => false, 'hata' => 'tablo_yok']); }
        error_log('emeklirobot darbe sil: ' . $e->getMessage());
        cikis(500, ['ok' => false, 'hata' => 'sunucu']);
    }
}

const SINIR = 500;
function epoch($dt) { return $dt === null ? null : strtotime($dt . ' UTC'); }
// Panelin "havuz" süzgeci için olayın çevresindeki log bilgisi. Eşikler darbe.js'tedir; burada yalnız ham bilgi toplanır
// (±1 saat; darbe.js'teki sürelerden geniş kalmalı). Loglar geç ulaşabildiği için saklanmaz, her görüntülemede yeniden bakılır.
const CEVRE_SN = 3600;
// Düzeltilmiş zamanı olan ve olmayan loglar ayrı sorgulanır (ikisi de (cihaz, zaman) indeksini kullanabilsin)
function log_sorgulari($pdo, $kosul, $sira) {
    $q = [];
    foreach (['duzeltilmis_zaman' => '', 'konum_zamani' => ' AND duzeltilmis_zaman IS NULL'] as $z => $ek) {
        $q[] = $pdo->prepare("SELECT id, log_tipi, arac_hareketli, $z AS z FROM emekli_log WHERE cihaz_adi = ?$ek AND $z >= ? AND $z <= ?$kosul" . str_replace('Z', $z, $sira));
    }
    return $q;
}
function satirlar($sorgular, $p) {
    $r = [];
    foreach ($sorgular as $st) { $st->execute($p); foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $x) { $r[] = $x; } }
    return $r;
}
function cevre($sorgular, $cihaz, $t) {
    list($sonSorgu, $sarjSorgu) = $sorgular;
    $son = null; // olay anındaki ya da ondan önceki son log
    foreach (satirlar($sonSorgu, [$cihaz, gmdate('Y-m-d H:i:s', $t - CEVRE_SN), gmdate('Y-m-d H:i:s', $t)]) as $x) {
        if ($son === null || $x['z'] > $son['z'] || ($x['z'] === $son['z'] && (int)$x['id'] > (int)$son['id'])) { $son = $x; }
    }
    $fark = null; $tip = null; // en yakın şarj değişimi: (şarj logu zamanı - olay zamanı) sn
    foreach (satirlar($sarjSorgu, [$cihaz, gmdate('Y-m-d H:i:s', $t - CEVRE_SN), gmdate('Y-m-d H:i:s', $t + CEVRE_SN)]) as $x) {
        $f = strtotime($x['z'] . ' UTC') - $t;
        if ($fark === null || abs($f) < abs($fark)) { $fark = $f; $tip = $x['log_tipi']; }
    }
    return [
        'sonLogSn' => $son === null ? null : $t - strtotime($son['z'] . ' UTC'),
        'sonHareketli' => ($son === null || $son['arac_hareketli'] === null) ? null : (int)$son['arac_hareketli'] === 1,
        'sarjFarkSn' => $fark, 'sarjTip' => $tip,
    ];
}
function olay($r, $sorgular) {
    $veri = json_decode($r['veri'], true);
    $t = epoch($r['duzeltilmis_zaman'] !== null ? $r['duzeltilmis_zaman'] : $r['zaman']);
    return [
        'no' => (int)$r['id'], 'cihaz' => $r['cihaz_adi'],
        'zaman' => $t,
        'cevre' => cevre($sorgular, $r['cihaz_adi'], $t),
        'telefonZamani' => epoch($r['zaman']), 'zamanKaynagi' => $r['zaman_kaynagi'],
        'asama' => $r['asama'], 'etiket' => $r['etiket'], 'gercekDurum' => $r['gercek_durum'], 'tepeG' => (float)$r['tepe_g'],
        'gpsAdet' => (int)$r['gps_adet'], 'ilkAlinma' => epoch($r['ilk_alinma']), 'sonAlinma' => epoch($r['son_alinma']),
        'veri' => is_array($veri) ? $veri : new stdClass(),
    ];
}
$KOLON = 'id, cihaz_adi, zaman, duzeltilmis_zaman, zaman_kaynagi, asama, etiket, gercek_durum, tepe_g, veri, gps_adet, ilk_alinma, son_alinma';

try {
    $pdo = db();
    $islem = (string)($_GET['islem'] ?? 'liste');
    $sorgular = [
        log_sorgulari($pdo, '', ' ORDER BY Z DESC, id DESC LIMIT 1'),
        log_sorgulari($pdo, " AND log_tipi IN ('SARJ_BASLADI','SARJ_KESILDI')", ''),
    ];
    if ($islem === 'liste') {
        $liste = [];
        foreach ($pdo->query("SELECT $KOLON FROM emekli_darbe ORDER BY COALESCE(duzeltilmis_zaman, zaman) DESC, id DESC LIMIT " . SINIR) as $r) { $liste[] = olay($r, $sorgular); }
        $toplam = (int)$pdo->query('SELECT COUNT(*) FROM emekli_darbe')->fetchColumn();
        cikis(200, ['ok' => true, 'olaylar' => $liste, 'toplam' => $toplam]);
    }
    if ($islem === 'olay') {
        $st = $pdo->prepare("SELECT $KOLON, gps FROM emekli_darbe WHERE id = ?");
        $st->execute([(int)($_GET['no'] ?? 0)]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if (!$r) { cikis(404, ['ok' => false, 'hata' => 'yok']); }
        $gps = json_decode($r['gps'], true);
        cikis(200, ['ok' => true, 'olay' => olay($r, $sorgular), 'gps' => is_array($gps) ? $gps : []]);
    }
    cikis(400, ['ok' => false, 'hata' => 'islem']);
} catch (Exception $e) {
    if ($e instanceof PDOException && (string)$e->getCode() === '42S02') { cikis(503, ['ok' => false, 'hata' => 'tablo_yok']); }
    error_log('emeklirobot darbe: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
