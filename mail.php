<?php
// İletişim formu işleyicisi. JSON döner. PHP 7.4+
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$MSG = [
  'tr' => ['ok' => 'Mesajınız başarıyla gönderildi. Teşekkür ederiz.', 'req' => 'Lütfen zorunlu (*) alanları doldurun.',
           'mail' => 'Geçerli bir e-posta adresi girin.', 'err' => 'Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.', 'wait' => 'Çok sık gönderim yaptınız, lütfen biraz bekleyin.'],
  'en' => ['ok' => 'Your message has been sent. Thank you.', 'req' => 'Please fill in the required (*) fields.',
           'mail' => 'Please enter a valid e-mail address.', 'err' => 'Your message could not be sent. Please try again later.', 'wait' => 'Too many requests, please wait a moment.'],
  'de' => ['ok' => 'Ihre Nachricht wurde gesendet. Vielen Dank.', 'req' => 'Bitte füllen Sie die Pflichtfelder (*) aus.',
           'mail' => 'Bitte geben Sie eine gültige E-Mail-Adresse ein.', 'err' => 'Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.', 'wait' => 'Zu viele Anfragen, bitte warten Sie einen Moment.'],
];
$lang = $_POST['lang'] ?? 'tr';
if (!isset($MSG[$lang])) { $lang = 'tr'; }
$T = $MSG[$lang];

function out($ok, $text, $code = 200) { http_response_code($code); echo json_encode(['ok' => $ok, 'message' => $text], JSON_UNESCAPED_UNICODE); exit; }
function clean($v, $max) { $v = trim((string)$v); $v = str_replace(["\r", "\0"], '', $v); return mb_substr($v, 0, $max, 'UTF-8'); }
function oneline($v) { return trim(preg_replace('/[\r\n]+/', ' ', $v)); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { out(false, $T['err'], 405); }
if (!empty($_POST['website'])) { out(true, $T['ok']); }   // honeypot: botlara sessiz başarı

$ad = oneline(clean($_POST['ad'] ?? '', 100));
$tel = oneline(clean($_POST['telefon'] ?? '', 40));
$eposta = oneline(clean($_POST['eposta'] ?? '', 150));
$konu = oneline(clean($_POST['konu'] ?? '', 150));
$mesaj = clean($_POST['mesaj'] ?? '', 5000);

if ($ad === '' || $eposta === '' || $konu === '' || $mesaj === '') { out(false, $T['req'], 422); }
if (!filter_var($eposta, FILTER_VALIDATE_EMAIL)) { out(false, $T['mail'], 422); }

// Basit hız sınırı: aynı IP için 30 sn
$rl = sys_get_temp_dir() . '/mo_rl_' . md5($_SERVER['REMOTE_ADDR'] ?? 'x');
if (is_file($rl) && time() - filemtime($rl) < 30) { out(false, $T['wait'], 429); }

$host = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
$host = preg_replace('/^www\./', '', $host);
$host = preg_replace('/[^a-z0-9.\-]/i', '', $host);
$from = $MAIL_FROM !== '' ? $MAIL_FROM : 'no-reply@' . $host;

$body = "Web sitesinden yeni iletişim formu mesajı\r\n"
      . "----------------------------------------\r\n"
      . "Ad Soyad : $ad\r\nTelefon  : $tel\r\nE-posta  : $eposta\r\nKonu     : $konu\r\nDil      : $lang\r\n"
      . "IP       : " . ($_SERVER['REMOTE_ADDR'] ?? '') . "\r\n\r\n$mesaj\r\n";

$subject = '=?UTF-8?B?' . base64_encode("[$SITE_NAME] $konu") . '?=';
$headers = [
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'From: =?UTF-8?B?' . base64_encode($SITE_NAME) . "?= <$from>",
  'Reply-To: ' . $eposta,
  'X-Mailer: PHP/' . phpversion(),
];

if (@mail($MAIL_TO, $subject, $body, implode("\r\n", $headers))) { @touch($rl); out(true, $T['ok']); }
out(false, $T['err'], 500);
