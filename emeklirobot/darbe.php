<?php
// Darbe adayları (panel, salt okunur): liste ve tek olayın GPS izi. Yalnızca oturum. PHP 7.0+ uyumlu.
require __DIR__ . '/_ortak.php';
oturum_baslat();
header('Content-Type: application/json; charset=utf-8');

function cikis($http, $veri) { http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE); exit; }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
session_write_close();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { header('Allow: GET'); cikis(405, ['ok' => false, 'hata' => 'yontem']); }

const SINIR = 500;
function epoch($dt) { return $dt === null ? null : strtotime($dt . ' UTC'); }
function olay($r) {
    $veri = json_decode($r['veri'], true);
    return [
        'no' => (int)$r['id'], 'cihaz' => $r['cihaz_adi'],
        'zaman' => epoch($r['duzeltilmis_zaman'] !== null ? $r['duzeltilmis_zaman'] : $r['zaman']),
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
    if ($islem === 'liste') {
        $liste = [];
        foreach ($pdo->query("SELECT $KOLON FROM emekli_darbe ORDER BY COALESCE(duzeltilmis_zaman, zaman) DESC, id DESC LIMIT " . SINIR) as $r) { $liste[] = olay($r); }
        $toplam = (int)$pdo->query('SELECT COUNT(*) FROM emekli_darbe')->fetchColumn();
        cikis(200, ['ok' => true, 'olaylar' => $liste, 'toplam' => $toplam]);
    }
    if ($islem === 'olay') {
        $st = $pdo->prepare("SELECT $KOLON, gps FROM emekli_darbe WHERE id = ?");
        $st->execute([(int)($_GET['no'] ?? 0)]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
        if (!$r) { cikis(404, ['ok' => false, 'hata' => 'yok']); }
        $gps = json_decode($r['gps'], true);
        cikis(200, ['ok' => true, 'olay' => olay($r), 'gps' => is_array($gps) ? $gps : []]);
    }
    cikis(400, ['ok' => false, 'hata' => 'islem']);
} catch (Exception $e) {
    if ($e instanceof PDOException && (string)$e->getCode() === '42S02') { cikis(503, ['ok' => false, 'hata' => 'tablo_yok']); }
    error_log('emeklirobot darbe: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
