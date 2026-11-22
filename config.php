<?php
// Site ayarları. İletişim formu e-postaları $MAIL_TO adresine gider.
// Not: Bu dosya yalnızca PHP ile okunur; tarayıcıdan doğrudan çağrılırsa boş döner.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php') { http_response_code(403); exit; }

$MAIL_TO   = 'tuzlumustafa@gmail.com';   // DENEME: formun düşeceği adres (canlıda firmanın adresi ile değiştirin)
$SITE_NAME = 'Marmara Ofis';
// Gönderen adresi: mümkünse alan adınıza ait bir adres yazın (SPF/spam için). Boşsa no-reply@<alanadı> kullanılır.
$MAIL_FROM = '';

// SMTP (önerilen). Gerçek bilgileri BURAYA YAZMAYIN (repo'ya girer).
// Sunucuda, bu dosyanın yanına config.local.php oluşturup şu satırları yazın:
//   <?php
//   $SMTP = ['host' => 'mail.alanadiniz.com', 'port' => 587, 'secure' => 'tls', 'user' => 'info@alanadiniz.com', 'pass' => 'SIFRE'];
//   $MAIL_FROM = 'info@alanadiniz.com';
// secure: 'tls' (STARTTLS, port 587), 'ssl' (port 465) veya '' (şifresiz, 25).
// host boşsa PHP mail() denenir.
$SMTP = ['host' => '', 'port' => 587, 'secure' => 'tls', 'user' => '', 'pass' => ''];

if (is_file(__DIR__ . '/config.local.php')) { require __DIR__ . '/config.local.php'; }
