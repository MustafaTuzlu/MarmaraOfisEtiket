<?php
// Panel veritabanı yönetimi: istatistik, silme önizleme, silme, optimize. Yalnızca oturum + CSRF ile.
require __DIR__ . '/_ortak.php';
oturum_baslat();
header('Content-Type: application/json; charset=utf-8');

function cikis($http, $veri) { http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE); exit; }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$csrf = $_SESSION['csrf'] ?? '';
session_write_close();

if ($post) {
    if (!hash_equals((string)$csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { cikis(403, ['ok' => false, 'hata' => 'csrf']); }
    $girdi = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
    if (!is_array($girdi)) { $girdi = []; }
    $islem = (string)($girdi['islem'] ?? '');
    $kural = (string)($girdi['kural'] ?? '');
} else {
    $islem = (string)($_GET['islem'] ?? 'bilgi');
    $kural = (string)($_GET['kural'] ?? '');
}

$ZAMAN = 'COALESCE(duzeltilmis_zaman, konum_zamani)';
// Silme kuralı -> WHERE (UTC). Türkiye saati sabit UTC+3 varsayılır.
function kural_kosul($kural, $ZAMAN, &$p) {
    $simdi = time();
    switch ($kural) {
        case 'hepsi': return '';
        case 'hafta': $p[] = gmdate('Y-m-d H:i:s', $simdi - 7 * 86400); return "WHERE $ZAMAN < ?";
        case 'ay':
            $d = new DateTime('@' . $simdi); $d->modify('-1 month');
            $p[] = $d->format('Y-m-d H:i:s'); return "WHERE $ZAMAN < ?";
        case 'bugun':
            $yerel = $simdi + 3 * 3600;
            $p[] = gmdate('Y-m-d H:i:s', $yerel - ($yerel % 86400) - 3 * 3600); return "WHERE $ZAMAN >= ?";
    }
    return null;
}

try {
    $pdo = db();
    if ($islem === 'bilgi' && !$post) {
        $toplam = (int)$pdo->query('SELECT COUNT(*) FROM emekli_log')->fetchColumn();
        $b = $pdo->query("SELECT DATA_LENGTH d, INDEX_LENGTH i FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emekli_log'")->fetch(PDO::FETCH_ASSOC);
        $a = $pdo->query("SELECT MIN($ZAMAN) en_eski, MAX($ZAMAN) en_yeni FROM emekli_log")->fetch(PDO::FETCH_ASSOC);
        cikis(200, ['ok' => true, 'toplam' => $toplam, 'veriBayt' => (int)($b['d'] ?? 0), 'indeksBayt' => (int)($b['i'] ?? 0),
            'boyutBayt' => (int)($b['d'] ?? 0) + (int)($b['i'] ?? 0),
            'enEski' => empty($a['en_eski']) ? null : str_replace(' ', 'T', $a['en_eski']) . 'Z',
            'enYeni' => empty($a['en_yeni']) ? null : str_replace(' ', 'T', $a['en_yeni']) . 'Z']);
    }
    if ($islem === 'onizle' && !$post) {
        $p = []; $k = kural_kosul($kural, $ZAMAN, $p);
        if ($k === null) { cikis(400, ['ok' => false, 'hata' => 'kural']); }
        $st = $pdo->prepare("SELECT COUNT(*) FROM emekli_log $k"); $st->execute($p);
        cikis(200, ['ok' => true, 'adet' => (int)$st->fetchColumn()]);
    }
    if ($islem === 'sil' && $post) {
        $p = []; $k = kural_kosul($kural, $ZAMAN, $p);
        if ($k === null) { cikis(400, ['ok' => false, 'hata' => 'kural']); }
        @set_time_limit(60);
        $bas = microtime(true); $silinen = 0; $bitti = false;
        $st = $pdo->prepare("DELETE FROM emekli_log $k LIMIT 10000");
        while (microtime(true) - $bas < 40) {
            $st->execute($p);
            $n = $st->rowCount();
            $silinen += $n;
            if ($n < 10000) { $bitti = true; break; }
        }
        error_log("emeklirobot panel: silme kural=$kural silinen=$silinen bitti=" . ($bitti ? '1' : '0') . ' ip=' . ($_SERVER['REMOTE_ADDR'] ?? ''));
        cikis(200, ['ok' => true, 'silinen' => $silinen, 'bitti' => $bitti]);
    }
    if ($islem === 'optimize' && $post) {
        @set_time_limit(60);
        $pdo->query('OPTIMIZE TABLE emekli_log')->fetchAll();
        cikis(200, ['ok' => true]);
    }
    cikis(400, ['ok' => false, 'hata' => 'islem']);
} catch (Exception $e) {
    error_log('emeklirobot db: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
