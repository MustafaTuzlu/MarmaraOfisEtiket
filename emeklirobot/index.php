<?php
// /emeklirobot/ : giriş + panel
require __DIR__ . '/_ortak.php';
oturum_baslat();

$hata = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $islem = $_POST['islem'] ?? '';
    if (!hash_equals(csrf(), (string)($_POST['csrf'] ?? ''))) {
        $hata = 'Oturum süresi doldu, tekrar deneyin.';
    } elseif ($islem === 'cikis') {
        $_SESSION = [];
        session_destroy();
        header('Location: /emeklirobot/');
        exit;
    } elseif ($islem === 'giris') {
        if (kilit_kalan() > 0) {
            http_response_code(429);
            $hata = 'Çok fazla hatalı deneme. Lütfen biraz sonra tekrar deneyin.';
        } else {
            $kul = (string)($_POST['kullanici'] ?? '');
            $sif = (string)($_POST['sifre'] ?? '');
            $hash = (is_array($DASH) && !empty($DASH['hash'])) ? $DASH['hash'] : '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890';
            $sifOk = password_verify($sif, $hash);
            $kulOk = is_array($DASH) && !empty($DASH['user']) && hash_equals((string)$DASH['user'], $kul);
            if (!empty($DASH['hash']) && $kulOk && $sifOk) {
                basarili_temizle();
                session_regenerate_id(true);
                $_SESSION['giris'] = true;
                $_SESSION['csrf'] = bin2hex(random_bytes(16));
                $_SESSION['son'] = time();
                header('Location: /emeklirobot/');
                exit;
            }
            basarisiz_kaydet();
            usleep(600000);
            $hata = 'Kullanıcı adı veya şifre hatalı.';
        }
    }
}

if (girisli()) {
    header("Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: https://tile.openstreetmap.org https://cdnjs.cloudflare.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    require __DIR__ . '/_panel.php';
    exit;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>Giriş</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  form{background:#fff;padding:28px;border-radius:12px;width:min(320px,90vw);box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{font-size:18px;margin:0 0 16px;color:#0f172a}
  label{display:block;font-size:13px;color:#475569;margin-bottom:12px}
  input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px}
  button{width:100%;padding:11px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:16px;cursor:pointer}
  .h{color:#b91c1c;font-size:13px;margin-bottom:12px}
</style>
</head>
<body>
<form method="post" action="/emeklirobot/" autocomplete="on">
  <h1>Giriş</h1>
  <?php if ($hata !== ''): ?><div class="h"><?= htmlspecialchars($hata, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
  <input type="hidden" name="islem" value="giris">
  <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf(), ENT_QUOTES, 'UTF-8') ?>">
  <label>Kullanıcı <input name="kullanici" autocomplete="username" autofocus required></label>
  <label>Şifre <input name="sifre" type="password" autocomplete="current-password" required></label>
  <button type="submit">Giriş yap</button>
</form>
</body>
</html>
