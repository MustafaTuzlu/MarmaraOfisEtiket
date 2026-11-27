<?php
// Veritabanı yönetimi: genel bakış, tablo inceleme, temizlik, bakım (OPTIMIZE), yedek, işlem geçmişi.
// Yalnızca oturum; değiştiren işlemler ve yedek POST + CSRF. PHP 7.0+ / MariaDB 5.5.
//
// GÜVENLİK KURALLARI (değiştirirken koru):
//  * Tablo ve temizlik kuralları yalnızca aşağıdaki sabit listeden seçilir; istekten SQL parçası alınmaz.
//  * 'korumali' tablolar (yerler ve bağlantılı tablolar, işlem geçmişi, ayarlar) için HİÇBİR silme kuralı yoktur.
//    TRUNCATE/DROP hiçbir yerde kullanılmaz.
//  * WHERE'siz silme yalnızca açıkça 'hepsi' adlı kuralda olur.
require __DIR__ . '/_ortak.php';
oturum_baslat();

function cikis($http, $veri) { header('Content-Type: application/json; charset=utf-8'); http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE); exit; }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$csrf = (string)($_SESSION['csrf'] ?? '');
session_write_close();

$ZAMAN = 'COALESCE(duzeltilmis_zaman, konum_zamani)';
const ONAY_SOZU = 'SİL';
const PARCA = 10000;

// Panelin bildiği tablolar. kurallar: ad => [etiket, tehlikeli(yazılı onay gerekir), parametre türü|null]
function tablolar() {
    $eski = function ($e) { return [$e, false, null]; };
    return [
        'emekli_log' => ['ad' => 'Konum logları', 'aciklama' => 'Telefonların gönderdiği ham kayıtlar. Harita, tablo, analiz ve yolculuk oynatma bu veriyi kullanır.', 'korumali' => false,
            'kurallar' => ['bugun' => ['Bugüne ait olanlar', false, null], 'hafta' => $eski('1 haftadan eski'), 'ay1' => $eski('1 aydan eski'), 'ay3' => $eski('3 aydan eski'), 'ay6' => $eski('6 aydan eski'), 'ay12' => $eski('1 yıldan eski'),
                'aralik' => ['Tarih aralığı (iki gün dahil)', true, 'aralik'], 'cihaz' => ['Bir cihazın tüm logları', true, 'cihaz'], 'hepsi' => ['TÜM loglar', true, null]]],
        'emekli_gun' => ['ad' => 'Günlük rapor özetleri', 'aciklama' => 'Yolculuk listesi, rapor, ziyaretler, karne ve bakım km hesabının kaynağı. Ham loglar silinmişse yeniden üretilemez.', 'korumali' => false,
            'kurallar' => ['ay12' => ['1 yıldan eski', true, null], 'ay24' => ['2 yıldan eski', true, null], 'cihaz' => ['Bir cihazın tüm özetleri', true, 'cihaz'], 'hepsi' => ['TÜM özetler', true, null]]],
        'emekli_yolculuk_etiket' => ['ad' => 'Yolculuk defteri', 'aciklama' => 'Yolculuklara elle verilen İş/Özel etiketleri ve notlar.', 'korumali' => false,
            'kurallar' => ['ay12' => ['1 yıldan eski', true, null], 'ay24' => ['2 yıldan eski', true, null], 'hepsi' => ['TÜM etiket ve notlar', true, null]]],
        'emekli_masraf' => ['ad' => 'Masraf defteri', 'aciklama' => 'Elle girilen yakıt, otopark, köprü, bakım ve diğer harcamalar.', 'korumali' => false,
            'kurallar' => ['ay24' => ['2 yıldan eski', true, null], 'ay60' => ['5 yıldan eski', true, null], 'hepsi' => ['TÜM masraflar', true, null]]],
        'emekli_bakim' => ['ad' => 'Bakım maddeleri', 'aciklama' => 'Bakım hatırlatıcı maddeleri. Tek tek silme Bakım penceresindedir.', 'korumali' => false,
            'kurallar' => ['hepsi' => ['TÜM bakım maddeleri', true, null]]],
        'emekli_arac' => ['ad' => 'Araç kilometreleri', 'aciklama' => 'Bakım için girilen gösterge kilometreleri.', 'korumali' => false,
            'kurallar' => ['hepsi' => ['TÜM kilometre kayıtları', true, null]]],
        'emekli_komut' => ['ad' => 'Anlık durum istekleri', 'aciklama' => '“Anlık Durum” için telefona bırakılan istekler ve sonuç durumları.', 'korumali' => false,
            'kurallar' => ['biten7' => ['7 günden eski, sonuçlanmış istekler', false, null], 'biten' => ['Sonuçlanmış tüm istekler', false, null], 'hepsi' => ['TÜM istekler (bekleyenler dahil)', true, null]]],
        'cihaz_anlik' => ['ad' => 'Son anlık durum', 'aciklama' => 'Her cihazın en son gönderdiği anlık durum (cihaz başına tek satır).', 'korumali' => false,
            'kurallar' => ['cihaz' => ['Bir cihazın anlık durumu', false, 'cihaz'], 'hepsi' => ['TÜM anlık durumlar', true, null]]],
        'emekli_yer' => ['ad' => 'Kayıtlı yerler', 'aciklama' => 'Yer adları ve türleri. Yalnızca “Yerlerim” ekranından tek tek yönetilir.', 'korumali' => true, 'kurallar' => []],
        'emekli_yer_nokta' => ['ad' => 'Yer konumları', 'aciklama' => 'Yerlerin harita noktaları ve yarıçapları (yerlere bağlı).', 'korumali' => true, 'kurallar' => []],
        'emekli_kural' => ['ad' => 'İş/Özel kuralları', 'aciklama' => 'Yerlere bağlı otomatik etiket kuralları. Yolculuklar ekranından yönetilir.', 'korumali' => true, 'kurallar' => []],
        'emekli_ayar' => ['ad' => 'Panel ayarları', 'aciklama' => 'Km ücreti, saklama süresi, gece saatleri gibi ayarlar.', 'korumali' => true, 'kurallar' => []],
        'emekli_islem_log' => ['ad' => 'İşlem geçmişi', 'aciklama' => 'Bu pencereden yapılan silme, optimize ve yedek işlemlerinin kaydı. Panelden silinemez.', 'korumali' => true, 'kurallar' => []],
    ];
}

function ay_once($ay) { $d = new DateTime('@' . time()); $d->modify('-' . (int)$ay . ' month'); return $d->getTimestamp(); }
function ist_gun_basi_utc($gun) { return strtotime($gun . ' 00:00:00 UTC') - 3 * 3600; } // Türkiye sabit UTC+3
function gecerli_gun($v) { return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v . ' 00:00:00 UTC') !== false; }

// (tablo, kural) -> ['WHERE ...' ya da '' (yalnız 'hepsi'), parametreler] ; tanımsızsa null. Sayım ve silme AYNI koşulu kullanır.
function kosul($tablo, $kural, $deger, $ZAMAN) {
    $T = tablolar();
    if (!isset($T[$tablo]) || $T[$tablo]['korumali'] || !isset($T[$tablo]['kurallar'][$kural])) { return null; }
    if ($kural === 'hepsi') { return ['', []]; }
    if ($kural === 'cihaz') {
        $c = is_array($deger) ? ($deger['cihaz'] ?? null) : null;
        if (!is_string($c) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $c)) { return null; }
        return ['WHERE cihaz_adi = ?', [$c]];
    }
    $simdi = time();
    $yerel = $simdi + 3 * 3600;
    $bugunUtc = $yerel - ($yerel % 86400) - 3 * 3600;
    if ($tablo === 'emekli_log') {
        if ($kural === 'bugun') { return ["WHERE $ZAMAN >= ?", [gmdate('Y-m-d H:i:s', $bugunUtc)]]; }
        if ($kural === 'hafta') { return ["WHERE $ZAMAN < ?", [gmdate('Y-m-d H:i:s', $simdi - 7 * 86400)]]; }
        if (preg_match('/^ay(1|3|6|12)$/', $kural, $m)) { return ["WHERE $ZAMAN < ?", [gmdate('Y-m-d H:i:s', ay_once($m[1]))]]; }
        if ($kural === 'aralik') {
            $b = is_array($deger) ? ($deger['bas'] ?? null) : null;
            $s = is_array($deger) ? ($deger['bit'] ?? null) : null;
            if (!gecerli_gun($b) || !gecerli_gun($s) || $b > $s) { return null; }
            return ["WHERE $ZAMAN >= ? AND $ZAMAN < ?", [gmdate('Y-m-d H:i:s', ist_gun_basi_utc($b)), gmdate('Y-m-d H:i:s', ist_gun_basi_utc($s) + 86400)]];
        }
        return null;
    }
    if ($tablo === 'emekli_komut') {
        if ($kural === 'biten') { return ['WHERE bekleyen IS NULL', []]; }
        if ($kural === 'biten7') { return ['WHERE bekleyen IS NULL AND olusturma < ?', [gmdate('Y-m-d H:i:s', $simdi - 7 * 86400)]]; }
        return null;
    }
    if (preg_match('/^ay(12|24|60)$/', $kural, $m)) {
        $sinir = gmdate('Y-m-d', ay_once($m[1]) + 3 * 3600);
        if ($tablo === 'emekli_gun') { return ['WHERE gun < ?', [$sinir]]; }
        if ($tablo === 'emekli_masraf') { return ['WHERE tarih < ?', [$sinir]]; }
        if ($tablo === 'emekli_yolculuk_etiket') { return ['WHERE baslangic < ?', [$sinir . ' 00:00:00']]; }
    }
    return null;
}

function mevcut_tablolar($pdo) {
    $r = [];
    $st = $pdo->query("SELECT TABLE_NAME ad, TABLE_ROWS satir, DATA_LENGTH veri, INDEX_LENGTH indeks, DATA_FREE bos, ENGINE motor, UPDATE_TIME guncelleme "
        . "FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $x) { $r[$x['ad']] = $x; }
    return $r;
}
function islem_yaz($pdo, $islem, $hedef, $adet) {
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
    error_log("emeklirobot db: $islem $hedef adet=$adet ip=$ip");
    try {
        $pdo->prepare('INSERT INTO emekli_islem_log (zaman, islem, hedef, adet, ip) VALUES (?, ?, ?, ?, ?)')
            ->execute([gmdate('Y-m-d H:i:s'), $islem, function_exists('mb_substr') ? mb_substr($hedef, 0, 300, 'UTF-8') : substr($hedef, 0, 300), $adet, $ip]);
    } catch (Exception $e) { error_log('emeklirobot db: islem log yazılamadı: ' . $e->getMessage()); }
}
function iso_utc($dt) { return empty($dt) ? null : str_replace(' ', 'T', $dt) . 'Z'; }
// Yedek hatırlatıcı: son TAM yedek ('yedek_tam') ve hatırlatma süresi (gün; 0 = kapalı). İlgili tablolar yoksa null.
const YEDEK_GUN = 30;
function yedek_durum($pdo) {
    try {
        $son = $pdo->query("SELECT zaman FROM emekli_islem_log WHERE islem = 'yedek_tam' ORDER BY id DESC LIMIT 1")->fetchColumn();
        $esik = $pdo->query("SELECT deger FROM emekli_ayar WHERE anahtar = 'yedek_gun'")->fetchColumn();
    } catch (PDOException $e) {
        if ((string)$e->getCode() === '42S02') { return null; }
        throw $e;
    }
    return ['son' => $son === false ? null : iso_utc($son),
        'gecen' => $son === false ? null : max(0, (int)floor((time() - strtotime($son . ' UTC')) / 86400)),
        'esik' => $esik === false ? YEDEK_GUN : (int)$esik];
}

/* ---------- Yedek indirme (form POST; yanıt dosyadır) ---------- */
// Arabelleksiz sorgu KULLANILMAZ: sunucuda ilk tablodan sonraki sorgu başarısız oluyordu. Bellek için satırlar parça parça okunur.
const YEDEK_PARCA = 1000;
function birincil_anahtar($pdo, $tablo) {
    $st = $pdo->prepare("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY' ORDER BY SEQ_IN_INDEX");
    $st->execute([$tablo]);
    return $st->fetchAll(PDO::FETCH_COLUMN);
}
// Bir tabloyu INSERT IGNORE satırları olarak yazar; yazılan satır sayısını döner. $w/$p: sabit metinli koşullar ve değerleri.
function yedek_tablo($pdo, $t, $w, $p) {
    $pk = birincil_anahtar($pdo, $t);
    $artan = $pk === ['id']; // 'id' varsa kaldığı yerden devam eder (yedek sırasında yeni log gelse de satır atlanmaz)
    $sira = [];
    foreach ($pk as $k) { $sira[] = '`' . str_replace('`', '', $k) . '`'; }
    $sonId = 0; $atla = 0; $toplam = 0;
    while (true) {
        $kosullar = $w; $degerler = $p;
        if ($artan) { $kosullar[] = '`id` > ?'; $degerler[] = $sonId; }
        $sql = "SELECT * FROM `$t`" . ($kosullar ? ' WHERE ' . implode(' AND ', $kosullar) : '')
            . ($sira ? ' ORDER BY ' . implode(', ', $sira) : '') . ' LIMIT ' . YEDEK_PARCA . ($artan ? '' : ' OFFSET ' . (int)$atla);
        $st = $pdo->prepare($sql);
        $st->execute($degerler);
        $satirlar = $st->fetchAll(PDO::FETCH_ASSOC);
        $st->closeCursor();
        if (!$satirlar) { break; }
        $kolon = '`' . implode('`,`', array_keys($satirlar[0])) . '`';
        foreach (array_chunk($satirlar, 200) as $dilim) {
            $parti = [];
            foreach ($dilim as $r) {
                $d = [];
                foreach ($r as $v) { $d[] = $v === null ? 'NULL' : $pdo->quote((string)$v); }
                $parti[] = '(' . implode(',', $d) . ')';
            }
            echo "INSERT IGNORE INTO `$t` ($kolon) VALUES\n" . implode(",\n", $parti) . ";\n";
        }
        flush();
        $n = count($satirlar);
        $toplam += $n; $atla += $n;
        if ($artan) { $sonId = $satirlar[$n - 1]['id']; }
        if ($n < YEDEK_PARCA) { break; }
    }
    return $toplam;
}
function yedek_indir($pdo, $secilen, $logBas, $logBit, $ZAMAN, &$asama) {
    @set_time_limit(300);
    $var = mevcut_tablolar($pdo);
    // Yerler konumlarından önce yazılır (yabancı anahtar). Sıra açıkça kurulur: PHP 7.0'da usort sırayı korumaz.
    $sira = array_values(array_unique(array_merge(['emekli_yer', 'emekli_yer_nokta'], array_keys(tablolar()))));
    $liste = [];
    foreach ($sira as $t) { if (in_array($t, $secilen, true) && isset($var[$t])) { $liste[] = $t; } }
    if (!$liste) { http_response_code(400); header('Content-Type: text/plain; charset=utf-8'); echo 'Yedeklenecek tablo seçilmedi.'; exit; }

    $ayrinti = implode(',', $liste) . ($logBas || $logBit ? " (log: $logBas..$logBit)" : '');
    // Tam yedek: panelin tanıdığı ve veritabanında bulunan bütün tablolar, tarih aralığı olmadan
    $tam = !$logBas && !$logBit && count($liste) === count(array_intersect(array_keys(tablolar()), array_keys($var)));
    header('Content-Type: application/sql; charset=utf-8');
    header('Content-Disposition: attachment; filename="emekli-robot-yedek-' . gmdate('Ymd-Hi', time() + 3 * 3600) . '.sql"');
    while (ob_get_level() > 0 && @ob_end_flush()) { } // kaldırılamayan tamponda döngü sürmesin
    echo "-- EmekliRobot veritabanı yedeği. DİKKAT: konum geçmişi içerir; güvenli yerde saklayın.\n";
    echo "-- Geri yükleme: phpMyAdmin > İçe aktar. Var olan satırlar KORUNUR (CREATE TABLE IF NOT EXISTS + INSERT IGNORE).\n";
    echo '-- Bu dosyada olması gereken tablolar (' . count($liste) . '): ' . implode(', ', $liste) . "\n";
    if ($logBas || $logBit) { echo '-- Konum logları tarih aralığı: ' . ($logBas ? $logBas : 'başlangıçtan') . ' .. ' . ($logBit ? $logBit : 'bugüne') . "\n"; }
    echo "SET NAMES utf8mb4;\nSET time_zone = '+00:00';\n\n";
    $satirToplam = 0;
    foreach ($liste as $t) {
        $asama = $t;
        $olustur = $pdo->query("SHOW CREATE TABLE `$t`")->fetchAll(PDO::FETCH_NUM);
        echo '-- ' . $t . "\n" . preg_replace('/^CREATE TABLE /', 'CREATE TABLE IF NOT EXISTS ', $olustur[0][1]) . ";\n";
        $w = []; $p = [];
        if ($t === 'emekli_log') {
            if ($logBas) { $w[] = "$ZAMAN >= ?"; $p[] = gmdate('Y-m-d H:i:s', ist_gun_basi_utc($logBas)); }
            if ($logBit) { $w[] = "$ZAMAN < ?"; $p[] = gmdate('Y-m-d H:i:s', ist_gun_basi_utc($logBit) + 86400); }
        }
        $n = yedek_tablo($pdo, $t, $w, $p);
        $satirToplam += $n;
        echo "-- $t: $n satır\n\n";
        flush();
    }
    echo '-- Yedek tamamlandı. ' . count($liste) . " tablo, $satirToplam satır.\n";
    flush();
    // İşlem geçmişine yalnızca dosya sonuna kadar gönderildiyse yazılır; yarım yedek hatırlatıcıyı susturmaz
    if (!connection_aborted()) { islem_yaz($pdo, $tam ? 'yedek_tam' : 'yedek', $ayrinti, $satirToplam); }
    exit;
}

$g = [];
if ($post && isset($_POST['islem']) && $_POST['islem'] === 'yedek') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(403); echo 'Oturum doğrulanamadı; sayfayı yenileyin.'; exit; }
    $secilen = isset($_POST['tablo']) && is_array($_POST['tablo']) ? array_map('strval', $_POST['tablo']) : [];
    $logBas = gecerli_gun($_POST['logBas'] ?? null) ? $_POST['logBas'] : null;
    $logBit = gecerli_gun($_POST['logBit'] ?? null) ? $_POST['logBit'] : null;
    $asama = 'bağlantı';
    try { yedek_indir(db(), $secilen, $logBas, $logBit, $ZAMAN, $asama); }
    catch (Exception $e) {
        error_log('emeklirobot yedek: ' . $e->getMessage());
        try { islem_yaz(db(), 'yedek_hata', 'Aşama: ' . $asama, null); } catch (Exception $y) { }
        // Dosya akışı başladıysa dosyanın sonuna açık bir hata satırı eklenir (yarım yedek fark edilsin)
        if (!headers_sent()) { http_response_code(500); }
        // Neden de yazılır (tek satır): sunucu günlüğüne erişmeden teşhis edilebilsin
        echo "\n-- HATA: yedek TAMAMLANAMADI. Bu dosyayı kullanmayın.\n";
        echo '-- Aşama: ' . $asama . ' | Neden: ' . substr(preg_replace('/\s+/', ' ', $e->getMessage()), 0, 300) . "\n";
        exit;
    }
}
if ($post) {
    if (!hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { cikis(403, ['ok' => false, 'hata' => 'csrf']); }
    $g = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
    if (!is_array($g)) { $g = []; }
    $islem = (string)($g['islem'] ?? '');
} else {
    $islem = (string)($_GET['islem'] ?? 'genel');
}

try {
    $pdo = db();
    $T = tablolar();

    if (!$post && $islem === 'genel') {
        @set_time_limit(60);
        $var = mevcut_tablolar($pdo);
        $liste = [];
        foreach ($T as $ad => $t) {
            $v = isset($var[$ad]) ? $var[$ad] : null;
            $adet = null;
            if ($v) { $adet = (int)$pdo->query("SELECT COUNT(*) FROM `$ad`")->fetchColumn(); }
            $kurallar = [];
            foreach ($t['kurallar'] as $k => $x) { $kurallar[] = ['kural' => $k, 'ad' => $x[0], 'tehlikeli' => $x[1], 'deger' => $x[2]]; }
            $liste[] = ['tablo' => $ad, 'ad' => $t['ad'], 'aciklama' => $t['aciklama'], 'korumali' => $t['korumali'], 'var' => $v !== null,
                'adet' => $adet, 'veriBayt' => $v ? (int)$v['veri'] : 0, 'indeksBayt' => $v ? (int)$v['indeks'] : 0, 'bosBayt' => $v ? (int)$v['bos'] : 0,
                'motor' => $v ? $v['motor'] : null, 'kurallar' => $kurallar];
        }
        // Panelin tanımadığı tablolar yalnızca listelenir (inceleme/silme yok)
        $diger = [];
        foreach ($var as $ad => $v) { if (!isset($T[$ad])) { $diger[] = ['tablo' => $ad, 'adet' => (int)$v['satir'], 'bayt' => (int)$v['veri'] + (int)$v['indeks']]; } }

        $log = ['enEski' => null, 'enYeni' => null, 'aylar' => [], 'cihazlar' => [], 'tipler' => []];
        $ozetEksik = null; $yetim = null; $takili = null;
        if (isset($var['emekli_log'])) {
            $a = $pdo->query("SELECT MIN($ZAMAN) en_eski, MAX($ZAMAN) en_yeni FROM emekli_log")->fetch(PDO::FETCH_ASSOC);
            $log['enEski'] = iso_utc($a['en_eski']); $log['enYeni'] = iso_utc($a['en_yeni']);
            foreach ($pdo->query("SELECT DATE_FORMAT(DATE_ADD($ZAMAN, INTERVAL 3 HOUR), '%Y-%m') ay, COUNT(*) n FROM emekli_log GROUP BY ay ORDER BY ay DESC LIMIT 24") as $r) { $log['aylar'][] = [$r['ay'], (int)$r['n']]; }
            foreach ($pdo->query("SELECT cihaz_adi c, COUNT(*) n, MAX($ZAMAN) son FROM emekli_log GROUP BY cihaz_adi ORDER BY cihaz_adi") as $r) { $log['cihazlar'][] = [$r['c'], (int)$r['n'], iso_utc($r['son'])]; }
            foreach ($pdo->query('SELECT log_tipi t, COUNT(*) n FROM emekli_log GROUP BY log_tipi ORDER BY n DESC') as $r) { $log['tipler'][] = [$r['t'], (int)$r['n']]; }
            if (isset($var['emekli_gun'])) {
                $ozetEksik = (int)$pdo->query("SELECT COUNT(*) FROM (SELECT cihaz_adi, DATE(DATE_ADD($ZAMAN, INTERVAL 3 HOUR)) AS gun, COUNT(*) AS adet, MAX(id) AS son_id FROM emekli_log GROUP BY cihaz_adi, gun) h "
                    . 'LEFT JOIN emekli_gun o ON o.cihaz_adi = h.cihaz_adi AND o.gun = h.gun WHERE o.gun IS NULL OR h.adet > o.adet OR h.son_id > o.son_id')->fetchColumn();
            }
        }
        if (isset($var['emekli_yer'], $var['emekli_yer_nokta'])) {
            $yetim = (int)$pdo->query('SELECT COUNT(*) FROM emekli_yer y LEFT JOIN emekli_yer_nokta n ON n.yer_id = y.id WHERE n.id IS NULL')->fetchColumn();
        }
        if (isset($var['emekli_komut'])) {
            $st = $pdo->prepare('SELECT COUNT(*) FROM emekli_komut WHERE bekleyen = 1 AND olusturma < ?');
            $st->execute([gmdate('Y-m-d H:i:s', time() - 1800)]);
            $takili = (int)$st->fetchColumn();
        }
        $saklama = 0;
        if (isset($var['emekli_ayar'])) {
            $x = $pdo->query("SELECT deger FROM emekli_ayar WHERE anahtar = 'saklama_ay'")->fetchColumn();
            $saklama = $x === false ? 0 : (int)$x;
        }
        $saklamaAsan = null;
        if ($saklama > 0 && isset($var['emekli_log'])) {
            $st = $pdo->prepare("SELECT COUNT(*) FROM emekli_log WHERE $ZAMAN < ?");
            $st->execute([gmdate('Y-m-d H:i:s', ay_once($saklama))]);
            $saklamaAsan = (int)$st->fetchColumn();
        }
        cikis(200, ['ok' => true, 'sunucu' => (string)$pdo->query('SELECT VERSION()')->fetchColumn(), 'tablolar' => $liste, 'diger' => $diger, 'log' => $log,
            'ozetEksik' => $ozetEksik, 'konumsuzYer' => $yetim, 'takiliKomut' => $takili, 'saklamaAy' => $saklama, 'saklamaAsan' => $saklamaAsan, 'yedek' => yedek_durum($pdo),
            'sunucuZamani' => gmdate('Y-m-d\TH:i:s\Z')]);
    }

    if (!$post && $islem === 'yedek_durum') {
        cikis(200, ['ok' => true, 'yedek' => yedek_durum($pdo)]);
    }

    if (!$post && $islem === 'tablo') {
        $ad = (string)($_GET['tablo'] ?? '');
        if (!isset($T[$ad])) { cikis(400, ['ok' => false, 'hata' => 'tablo']); }
        $var = mevcut_tablolar($pdo);
        if (!isset($var[$ad])) { cikis(404, ['ok' => false, 'hata' => 'tablo_yok']); }
        $kolonlar = [];
        $st = $pdo->prepare('SELECT COLUMN_NAME ad, COLUMN_TYPE tip, IS_NULLABLE bos, COLUMN_COMMENT aciklama FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION');
        $st->execute([$ad]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) { $kolonlar[] = [$r['ad'], $r['tip'], $r['bos'] === 'YES', $r['aciklama']]; }
        $indeksler = [];
        $st = $pdo->prepare('SELECT INDEX_NAME ad, NON_UNIQUE tekil_degil, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) kolonlar FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME, NON_UNIQUE');
        $st->execute([$ad]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) { $indeksler[] = [$r['ad'], (int)$r['tekil_degil'] === 0, $r['kolonlar']]; }
        // Son satırlar (salt okunur). Sıralama sütunu sabit listeden.
        $sirala = $kolonlar[0][0];
        foreach ($kolonlar as $k) { if ($k[0] === 'id') { $sirala = 'id'; } }
        $satirlar = [];
        foreach ($pdo->query("SELECT * FROM `$ad` ORDER BY `" . str_replace('`', '', $sirala) . '` DESC LIMIT 20')->fetchAll(PDO::FETCH_NUM) as $r) {
            $satirlar[] = array_map(function ($v) { if ($v === null) { return null; } $v = (string)$v; return strlen($v) > 120 ? (function_exists('mb_substr') ? mb_substr($v, 0, 120, 'UTF-8') : substr($v, 0, 120)) . '…' : $v; }, $r);
        }
        cikis(200, ['ok' => true, 'tablo' => $ad, 'kolonlar' => $kolonlar, 'indeksler' => $indeksler, 'satirlar' => $satirlar]);
    }

    if (!$post && $islem === 'gecmis') {
        $liste = [];
        foreach ($pdo->query('SELECT zaman, islem, hedef, adet, ip FROM emekli_islem_log ORDER BY id DESC LIMIT 200') as $r) {
            $liste[] = [iso_utc($r['zaman']), $r['islem'], $r['hedef'], $r['adet'] === null ? null : (int)$r['adet'], $r['ip']];
        }
        cikis(200, ['ok' => true, 'islemler' => $liste]);
    }

    if ($post && ($islem === 'onizle' || $islem === 'sil')) {
        $tablo = (string)($g['tablo'] ?? ''); $kural = (string)($g['kural'] ?? ''); $deger = $g['deger'] ?? null;
        if (isset($T[$tablo]) && $T[$tablo]['korumali']) { cikis(403, ['ok' => false, 'hata' => 'korumali']); }
        $k = kosul($tablo, $kural, $deger, $ZAMAN);
        if ($k === null) { cikis(400, ['ok' => false, 'hata' => 'kural']); }
        list($w, $p) = $k;
        if ($w === '' && $kural !== 'hepsi') { cikis(400, ['ok' => false, 'hata' => 'kural']); }
        if ($islem === 'onizle') {
            $st = $pdo->prepare("SELECT COUNT(*) FROM `$tablo` $w"); $st->execute($p);
            cikis(200, ['ok' => true, 'adet' => (int)$st->fetchColumn(), 'tehlikeli' => $T[$tablo]['kurallar'][$kural][1], 'onaySozu' => ONAY_SOZU]);
        }
        // Tehlikeli kurallarda yazılı onay sunucuda da zorunlu
        if ($T[$tablo]['kurallar'][$kural][1] && (string)($g['onay'] ?? '') !== ONAY_SOZU) { cikis(400, ['ok' => false, 'hata' => 'onay']); }
        @set_time_limit(60);
        $bas = microtime(true); $silinen = 0; $bitti = false;
        $st = $pdo->prepare("DELETE FROM `$tablo` $w LIMIT " . PARCA);
        while (microtime(true) - $bas < 40) {
            $st->execute($p);
            $n = $st->rowCount();
            $silinen += $n;
            if ($n < PARCA) { $bitti = true; break; }
        }
        $ayrinti = $tablo . ' / ' . $kural . ($p ? ' (' . implode(', ', $p) . ')' : '') . ($bitti ? '' : ' [yarım]');
        islem_yaz($pdo, 'sil', $ayrinti, $silinen);
        cikis(200, ['ok' => true, 'silinen' => $silinen, 'bitti' => $bitti]);
    }

    if ($post && $islem === 'optimize') {
        $ad = (string)($g['tablo'] ?? '');
        if (!isset($T[$ad])) { cikis(400, ['ok' => false, 'hata' => 'tablo']); } // OPTIMIZE veri silmez; korumalı tablolarda da güvenli
        $var = mevcut_tablolar($pdo);
        if (!isset($var[$ad])) { cikis(404, ['ok' => false, 'hata' => 'tablo_yok']); }
        @set_time_limit(120);
        $pdo->query("OPTIMIZE TABLE `$ad`")->fetchAll();
        islem_yaz($pdo, 'optimize', $ad, null);
        cikis(200, ['ok' => true]);
    }

    cikis(400, ['ok' => false, 'hata' => 'islem']);
} catch (Exception $e) {
    if ($e instanceof PDOException && (string)$e->getCode() === '42S02') { cikis(503, ['ok' => false, 'hata' => 'tablo_yok']); }
    error_log('emeklirobot db: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
