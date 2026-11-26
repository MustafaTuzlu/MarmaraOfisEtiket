<?php
// "Bana son durumu göster": cihaz listesi, komut açma, sonuç yoklama. Yalnızca oturum (+ POST için CSRF).
require __DIR__ . '/_ortak.php';
oturum_baslat();
header('Content-Type: application/json; charset=utf-8');

function cikis($http, $veri) { http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function utc_iso($s) { return empty($s) ? null : str_replace(' ', 'T', $s) . 'Z'; }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$csrf = $_SESSION['csrf'] ?? '';
session_write_close();

const KOMUT_OMUR = 1800; // 30 dk

// Cihazın son 20 gönderim partisinin (alinma_zamani) aralıklarından kaba bir cevap süresi tahmini.
function gonderim_tahmini($pdo, $cihaz, $simdi) {
    try {
        $st = $pdo->prepare('SELECT alinma_zamani FROM emekli_log WHERE cihaz_adi = ? ORDER BY id DESC LIMIT 1500');
        $st->execute([$cihaz]);
        $z = [];
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $a) { if (!in_array($a, $z, true)) { $z[] = $a; if (count($z) >= 20) { break; } } }
        if (count($z) < 2) { return null; }
        $t = array_map(function ($a) { return strtotime($a . ' UTC'); }, $z); // yeniden eskiye
        $aralik = [];
        for ($i = 0; $i < count($t) - 1; $i++) { $aralik[] = $t[$i] - $t[$i + 1]; }
        sort($aralik);
        $n = count($aralik);
        $med = $aralik[intdiv($n, 2)];
        $p80 = $aralik[min($n - 1, (int)floor($n * 0.8))]; // uç değerlere dayanıklı: çoğu aralık bunun altında
        return ['sonGonderim' => gmdate('Y-m-d\TH:i:s', $t[0]) . 'Z', 'aralikSn' => (int)$med, 'p80Sn' => (int)$p80, 'partiSayisi' => count($z)];
    } catch (Exception $e) { return null; }
}

if ($post) {
    if (!hash_equals((string)$csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { cikis(403, ['ok' => false, 'hata' => 'csrf']); }
    $girdi = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
    if (!is_array($girdi)) { $girdi = []; }
    $islem = (string)($girdi['islem'] ?? '');
    $cihaz = (string)($girdi['cihazAdi'] ?? '');
} else {
    $islem = (string)($_GET['islem'] ?? '');
    $cihaz = (string)($_GET['cihazAdi'] ?? '');
}

try {
    $pdo = db();
    $simdi = time();
    $simdiS = gmdate('Y-m-d H:i:s', $simdi);
    $esikS = gmdate('Y-m-d H:i:s', $simdi - KOMUT_OMUR);

    if ($islem === 'cihazlar' && !$post) {
        // Son görülme: log tablosundaki en yeni kayıt (düzeltilmiş zaman varsa o)
        $satir = $pdo->query('SELECT cihaz_adi, MAX(COALESCE(duzeltilmis_zaman, konum_zamani)) AS son FROM emekli_log GROUP BY cihaz_adi ORDER BY cihaz_adi')->fetchAll(PDO::FETCH_ASSOC);
        $liste = [];
        foreach ($satir as $r) { $liste[$r['cihaz_adi']] = ['cihazAdi' => $r['cihaz_adi'], 'sonGorulme' => utc_iso($r['son']), 'sonAnlik' => null]; }
        foreach ($pdo->query('SELECT cihaz_adi, alinma_zamani FROM cihaz_anlik')->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (!isset($liste[$r['cihaz_adi']])) { $liste[$r['cihaz_adi']] = ['cihazAdi' => $r['cihaz_adi'], 'sonGorulme' => null, 'sonAnlik' => null]; }
            $liste[$r['cihaz_adi']]['sonAnlik'] = utc_iso($r['alinma_zamani']);
        }
        ksort($liste);
        cikis(200, ['ok' => true, 'cihazlar' => array_values($liste)]);
    }

    if ($islem === 'ac' && $post) {
        if (!preg_match('/^[A-Za-z0-9_-]{1,50}$/', $cihaz)) { cikis(400, ['ok' => false, 'hata' => 'cihaz']); }
        for ($deneme = 0; $deneme < 2; $deneme++) {
            $pdo->beginTransaction();
            // Süresi dolmuş bekleyeni kapat
            $st = $pdo->prepare("UPDATE emekli_komut SET durum = 'ZAMAN_ASIMI', bekleyen = NULL, tamamlanma = ? WHERE cihaz_adi = ? AND bekleyen = 1 AND olusturma < ?");
            $st->execute([$simdiS, $cihaz, $esikS]);
            // Bekleyen varsa yenisini açma, mevcudun süresini yenile (tek bekleyen komut kuralı)
            $st = $pdo->prepare('SELECT id FROM emekli_komut WHERE cihaz_adi = ? AND bekleyen = 1 LIMIT 1 FOR UPDATE');
            $st->execute([$cihaz]);
            $id = $st->fetchColumn();
            try {
                if ($id) {
                    $pdo->prepare('UPDATE emekli_komut SET olusturma = ? WHERE id = ?')->execute([$simdiS, $id]);
                    $yeni = false;
                } else {
                    $pdo->prepare("INSERT INTO emekli_komut (cihaz_adi, tip, durum, bekleyen, olusturma) VALUES (?, 'DURUM_ISTE', 'BEKLIYOR', 1, ?)")->execute([$cihaz, $simdiS]);
                    $id = $pdo->lastInsertId();
                    $yeni = true;
                }
                $pdo->commit();
                cikis(200, ['ok' => true, 'komutId' => (int)$id, 'yeni' => $yeni, 'tahmin' => gonderim_tahmini($pdo, $cihaz, $simdi)]);
            } catch (PDOException $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                if ($deneme === 1 || (string)$e->getCode() !== '23000') { throw $e; } // eşzamanlı basış: bir kez daha dene
            }
        }
    }

    if ($islem === 'sorgu' && !$post) {
        $id = (int)($_GET['komutId'] ?? 0);
        if ($id < 1 || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $cihaz)) { cikis(400, ['ok' => false, 'hata' => 'istek']); }
        $pdo->prepare("UPDATE emekli_komut SET durum = 'ZAMAN_ASIMI', bekleyen = NULL, tamamlanma = ? WHERE id = ? AND bekleyen = 1 AND olusturma < ?")->execute([$simdiS, $id, $esikS]);
        $st = $pdo->prepare('SELECT durum, olusturma FROM emekli_komut WHERE id = ? AND cihaz_adi = ?');
        $st->execute([$id, $cihaz]);
        $k = $st->fetch(PDO::FETCH_ASSOC);
        if (!$k) { cikis(404, ['ok' => false, 'hata' => 'komut']); }
        $yan = ['ok' => true, 'durum' => $k['durum'], 'olusturma' => utc_iso($k['olusturma']), 'anlik' => null, 'alinma' => null];
        if ($k['durum'] === 'TAMAM') {
            $st = $pdo->prepare('SELECT veri, alinma_zamani FROM cihaz_anlik WHERE cihaz_adi = ?');
            $st->execute([$cihaz]);
            $a = $st->fetch(PDO::FETCH_ASSOC);
            if ($a) { $yan['anlik'] = json_decode($a['veri'], true); $yan['alinma'] = utc_iso($a['alinma_zamani']); }
        }
        cikis(200, $yan);
    }

    cikis(400, ['ok' => false, 'hata' => 'islem']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
    error_log('emeklirobot anlik: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
