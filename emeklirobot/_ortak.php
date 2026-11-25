<?php
// EmekliRobot paneli ortak yardımcıları. Doğrudan çağrılamaz. PHP 7.0+ uyumlu.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_ortak.php') { http_response_code(403); exit; }

require __DIR__ . '/../config.php';

header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

function oturum_baslat() {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('erdash');
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(['lifetime' => 0, 'path' => '/emeklirobot/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    } else {
        session_set_cookie_params(0, '/emeklirobot/; samesite=Strict', '', $https, true);
    }
    ini_set('session.use_strict_mode', '1');
    session_start();
    if (isset($_SESSION['son']) && time() - $_SESSION['son'] > 43200) { // 12 saat hareketsizlik
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['son'] = time();
}

function girisli() { return !empty($_SESSION['giris']); }

function csrf() {
    if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(16)); }
    return $_SESSION['csrf'];
}

// Giriş hız sınırı: IP başına 5 başarısız denemeden sonra 15 dk kilit.
function kilit_dosyasi() { return sys_get_temp_dir() . '/erd_rl_' . md5($_SERVER['REMOTE_ADDR'] ?? 'x'); }
function kilit_kalan() {
    $f = kilit_dosyasi();
    if (!is_file($f)) { return 0; }
    $d = json_decode((string)@file_get_contents($f), true);
    if (!is_array($d) || !isset($d['t'], $d['n'])) { return 0; }
    $gecen = time() - (int)$d['t'];
    if ($gecen > 900) { @unlink($f); return 0; }
    return ((int)$d['n'] >= 5) ? 900 - $gecen : 0;
}
function basarisiz_kaydet() {
    $f = kilit_dosyasi();
    $d = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
    $n = (is_array($d) && isset($d['t'], $d['n']) && time() - (int)$d['t'] <= 900) ? (int)$d['n'] : 0;
    @file_put_contents($f, json_encode(['n' => $n + 1, 't' => time()]), LOCK_EX);
}
function basarili_temizle() { @unlink(kilit_dosyasi()); }

function db() {
    global $DB;
    $dsn = 'mysql:host=' . $DB['host'] . ';port=' . (int)$DB['port'] . ';dbname=' . $DB['name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $DB['user'], $DB['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}
