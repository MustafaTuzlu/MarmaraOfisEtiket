<?php
// Site ayarları. İletişim formu e-postaları $MAIL_TO adresine gider.
// Not: Bu dosya yalnızca PHP ile okunur; tarayıcıdan doğrudan çağrılırsa boş döner.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php') { http_response_code(403); exit; }

$MAIL_TO   = 'tuzlumustafa@gmail.com';   // DENEME: formun düşeceği adres (canlıda firmanın adresi ile değiştirin)
$SITE_NAME = 'Marmara Ofis';
// Gönderen adresi: mümkünse alan adınıza ait bir adres yazın (SPF/spam için). Boşsa no-reply@<alanadı> kullanılır.
$MAIL_FROM = '';
