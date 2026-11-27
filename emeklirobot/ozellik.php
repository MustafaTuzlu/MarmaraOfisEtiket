<?php
// Kayıtlı yerler, günlük özetler, yolculuk etiketleri ve kuralları, bakım, masraf, ortak ayarlar. Yalnızca oturum; değiştiren işlemler POST + CSRF.
// Tablolar: db/2026-11-27-yerler.sql ve db/2026-11-27-masraf-kural.sql. PHP 7.0+ uyumlu.
require __DIR__ . '/_ortak.php';
oturum_baslat();
header('Content-Type: application/json; charset=utf-8');

function cikis($http, $veri) { http_response_code($http); echo json_encode($veri, JSON_UNESCAPED_UNICODE); exit; }
function hatali($neden) { cikis(400, ['ok' => false, 'hata' => 'girdi', 'neden' => $neden]); }

if (!girisli()) { cikis(401, ['ok' => false, 'hata' => 'oturum']); }
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$csrf = $_SESSION['csrf'] ?? '';
session_write_close();

$g = [];
if ($post) {
    if (!hash_equals((string)$csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { cikis(403, ['ok' => false, 'hata' => 'csrf']); }
    $ham = (string)file_get_contents('php://input', false, null, 0, 2097153);
    if (strlen($ham) > 2097152) { cikis(413, ['ok' => false, 'hata' => 'buyuk']); }
    $g = json_decode($ham, true);
    if (!is_array($g)) { hatali('json'); }
    $islem = (string)($g['islem'] ?? '');
} else {
    $islem = (string)($_GET['islem'] ?? '');
}

function metin($v, $enAz, $enCok, $ad) {
    if (!is_string($v)) { hatali($ad); }
    $v = trim($v);
    if (!preg_match('/^[^\x00-\x1F\x7F]{' . (int)$enAz . ',' . (int)$enCok . '}$/u', $v)) { hatali($ad); }
    return $v;
}
function tamsayi($v, $min, $max, $ad) {
    if (!is_int($v) && !(is_float($v) && floor($v) == $v)) { hatali($ad); }
    if ($v < $min || $v > $max) { hatali($ad); }
    return (int)$v;
}
function ondalik($v, $min, $max, $ad) {
    if (!(is_int($v) || is_float($v)) || $v < $min || $v > $max) { hatali($ad); }
    return (float)$v;
}
function cihaz($v) {
    if (!is_string($v) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $v)) { hatali('cihaz'); }
    return $v;
}
function tarih($v, $ad) {
    if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) { hatali($ad); }
    return $v;
}
function kimlik($g) { return tamsayi($g['id'] ?? null, 1, 2000000000, 'id'); }
function simdi_utc() { return gmdate('Y-m-d H:i:s'); }
function epoch($dt) { return strtotime($dt . ' UTC'); }

function nokta_girdi($n) {
    if (!is_array($n)) { hatali('nokta'); }
    return [
        metin($n['etiket'] ?? '', 0, 40, 'etiket'),
        round(ondalik($n['lat'] ?? null, -90, 90, 'lat'), 7),
        round(ondalik($n['lon'] ?? null, -180, 180, 'lon'), 7),
        tamsayi($n['yaricap'] ?? null, 30, 1000, 'yaricap'),
    ];
}
function tur_girdi($v) {
    if (!in_array($v, ['ev', 'is', 'diger'], true)) { hatali('tur'); }
    return $v;
}

$ZAMAN = 'COALESCE(duzeltilmis_zaman, konum_zamani)';
// Tarayıcılar arası ortak ayarlar: anahtar => [en az, en çok] (hepsi tamsayı ya da ondalık sayı)
$AYARLAR = ['km_ucreti' => [0, 10000], 'saklama_ay' => [0, 120], 'gece_bas' => [0, 23], 'gece_bit' => [0, 23], 'uzak_km' => [1, 2000]];
function kural_ucu($v) {
    if (!is_string($v) || !preg_match('/^(\*|tur:(ev|is|diger)|yer:[1-9][0-9]{0,9})$/', $v)) { hatali('kural_ucu'); }
    return $v;
}

try {
    $pdo = db();

    if (!$post) {
        if ($islem === 'yerler') {
            $yerler = [];
            foreach ($pdo->query('SELECT id, ad, tur FROM emekli_yer ORDER BY tur, ad, id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $yerler[(int)$r['id']] = ['id' => (int)$r['id'], 'ad' => $r['ad'], 'tur' => $r['tur'], 'noktalar' => []];
            }
            foreach ($pdo->query('SELECT id, yer_id, etiket, enlem, boylam, yaricap_m FROM emekli_yer_nokta ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $y = (int)$r['yer_id'];
                if (isset($yerler[$y])) {
                    $yerler[$y]['noktalar'][] = ['id' => (int)$r['id'], 'etiket' => $r['etiket'], 'lat' => (float)$r['enlem'], 'lon' => (float)$r['boylam'], 'yaricap' => (int)$r['yaricap_m']];
                }
            }
            cikis(200, ['ok' => true, 'yerler' => array_values($yerler)]);
        }
        if ($islem === 'gunler') {
            // Hangi günlerin özeti eksik/eski: ham kayıtların gün (Türkiye saati, UTC+3) başına sayısı ve saklı özetler
            @set_time_limit(60);
            $ham = [];
            foreach ($pdo->query("SELECT cihaz_adi, DATE(DATE_ADD($ZAMAN, INTERVAL 3 HOUR)) AS gun, COUNT(*) AS adet, MAX(id) AS son_id FROM emekli_log GROUP BY cihaz_adi, gun ORDER BY cihaz_adi, gun") as $r) {
                $ham[] = [$r['cihaz_adi'], $r['gun'], (int)$r['adet'], (int)$r['son_id']];
            }
            $ozet = [];
            foreach ($pdo->query('SELECT cihaz_adi, gun, adet, son_id, surum FROM emekli_gun') as $r) {
                $ozet[] = [$r['cihaz_adi'], $r['gun'], (int)$r['adet'], (int)$r['son_id'], (int)$r['surum']];
            }
            cikis(200, ['ok' => true, 'ham' => $ham, 'ozet' => $ozet]);
        }
        if ($islem === 'ozetler') {
            $bas = tarih($_GET['bas'] ?? null, 'bas');
            $bit = tarih($_GET['bit'] ?? null, 'bit');
            $st = $pdo->prepare('SELECT cihaz_adi, gun, veri FROM emekli_gun WHERE gun >= ? AND gun <= ? ORDER BY gun, cihaz_adi LIMIT 4000');
            $st->execute([$bas, $bit]);
            $liste = [];
            while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                $v = json_decode($r['veri'], true);
                if (is_array($v)) { $liste[] = ['cihaz' => $r['cihaz_adi'], 'gun' => $r['gun'], 'veri' => $v]; }
            }
            cikis(200, ['ok' => true, 'gunler' => $liste, 'kesildi' => count($liste) >= 4000]);
        }
        if ($islem === 'etiketler') {
            $liste = [];
            foreach ($pdo->query('SELECT id, cihaz_adi, baslangic, bitis, tur, notu FROM emekli_yolculuk_etiket ORDER BY baslangic DESC LIMIT 5000') as $r) {
                $liste[] = ['id' => (int)$r['id'], 'cihaz' => $r['cihaz_adi'], 't0' => epoch($r['baslangic']), 't1' => epoch($r['bitis']), 'tur' => $r['tur'], 'not' => $r['notu']];
            }
            cikis(200, ['ok' => true, 'etiketler' => $liste]);
        }
        if ($islem === 'bakim') {
            $araclar = []; $bakimlar = [];
            foreach ($pdo->query('SELECT cihaz_adi, km_taban, taban_zamani FROM emekli_arac') as $r) {
                $araclar[] = ['cihaz' => $r['cihaz_adi'], 'km' => (int)$r['km_taban'], 'zaman' => epoch($r['taban_zamani'])];
            }
            foreach ($pdo->query('SELECT id, cihaz_adi, ad, aralik_km, aralik_ay, son_km, son_tarih FROM emekli_bakim ORDER BY cihaz_adi, ad, id') as $r) {
                $bakimlar[] = ['id' => (int)$r['id'], 'cihaz' => $r['cihaz_adi'], 'ad' => $r['ad'],
                    'aralikKm' => $r['aralik_km'] === null ? null : (int)$r['aralik_km'], 'aralikAy' => $r['aralik_ay'] === null ? null : (int)$r['aralik_ay'],
                    'sonKm' => $r['son_km'] === null ? null : (int)$r['son_km'], 'sonTarih' => $r['son_tarih']];
            }
            cikis(200, ['ok' => true, 'araclar' => $araclar, 'bakimlar' => $bakimlar]);
        }
        if ($islem === 'kurallar') {
            $liste = [];
            foreach ($pdo->query('SELECT id, kaynak, hedef, iki_yon, tur FROM emekli_kural ORDER BY id') as $r) {
                $liste[] = ['id' => (int)$r['id'], 'kaynak' => $r['kaynak'], 'hedef' => $r['hedef'], 'ikiYon' => (int)$r['iki_yon'] === 1, 'tur' => $r['tur']];
            }
            cikis(200, ['ok' => true, 'kurallar' => $liste]);
        }
        if ($islem === 'masraflar') {
            $st = $pdo->prepare('SELECT id, cihaz_adi, tarih, tur, tutar, litre, km, notu FROM emekli_masraf WHERE tarih >= ? AND tarih <= ? ORDER BY tarih DESC, id DESC LIMIT 3000');
            $st->execute([tarih($_GET['bas'] ?? null, 'bas'), tarih($_GET['bit'] ?? null, 'bit')]);
            $liste = [];
            while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                $liste[] = ['id' => (int)$r['id'], 'cihaz' => $r['cihaz_adi'], 'tarih' => $r['tarih'], 'tur' => $r['tur'], 'tutar' => (float)$r['tutar'],
                    'litre' => $r['litre'] === null ? null : (float)$r['litre'], 'km' => $r['km'] === null ? null : (int)$r['km'], 'not' => $r['notu']];
            }
            cikis(200, ['ok' => true, 'masraflar' => $liste]);
        }
        if ($islem === 'ayarlar') {
            $a = [];
            foreach ($pdo->query('SELECT anahtar, deger FROM emekli_ayar') as $r) {
                if (isset($AYARLAR[$r['anahtar']])) { $a[$r['anahtar']] = (float)$r['deger']; }
            }
            cikis(200, ['ok' => true, 'ayarlar' => (object)$a]);
        }
        cikis(400, ['ok' => false, 'hata' => 'islem']);
    }

    /* ---------- Değiştiren işlemler ---------- */
    if ($islem === 'kural_kaydet') {
        $deger = [kural_ucu($g['kaynak'] ?? null), kural_ucu($g['hedef'] ?? null), !empty($g['ikiYon']) ? 1 : 0];
        if (!in_array($g['tur'] ?? null, ['is', 'ozel'], true)) { hatali('tur'); }
        $deger[] = $g['tur'];
        $pdo->prepare('INSERT INTO emekli_kural (kaynak, hedef, iki_yon, tur) VALUES (?, ?, ?, ?)')->execute($deger);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'kural_sil') {
        $pdo->prepare('DELETE FROM emekli_kural WHERE id = ?')->execute([kimlik($g)]);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'masraf_kaydet') {
        if (!in_array($g['tur'] ?? null, ['yakit', 'otopark', 'kopru', 'bakim', 'diger'], true)) { hatali('tur'); }
        $deger = [
            cihaz($g['cihaz'] ?? null), tarih($g['tarih'] ?? null, 'tarih'), $g['tur'], round(ondalik($g['tutar'] ?? null, 0, 10000000, 'tutar'), 2),
            isset($g['litre']) ? round(ondalik($g['litre'], 0, 5000, 'litre'), 2) : null,
            isset($g['km']) ? tamsayi($g['km'], 0, 5000000, 'km') : null,
            metin($g['not'] ?? '', 0, 200, 'not'),
        ];
        if (!empty($g['id'])) {
            $pdo->prepare('UPDATE emekli_masraf SET cihaz_adi = ?, tarih = ?, tur = ?, tutar = ?, litre = ?, km = ?, notu = ? WHERE id = ?')->execute(array_merge($deger, [kimlik($g)]));
        } else {
            $deger[] = simdi_utc();
            $pdo->prepare('INSERT INTO emekli_masraf (cihaz_adi, tarih, tur, tutar, litre, km, notu, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute($deger);
        }
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'masraf_sil') {
        $pdo->prepare('DELETE FROM emekli_masraf WHERE id = ?')->execute([kimlik($g)]);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'ayar_kaydet') {
        $anahtar = $g['anahtar'] ?? null;
        if (!is_string($anahtar) || !isset($AYARLAR[$anahtar])) { hatali('anahtar'); }
        $v = ondalik($g['deger'] ?? null, $AYARLAR[$anahtar][0], $AYARLAR[$anahtar][1], 'deger');
        $pdo->prepare('INSERT INTO emekli_ayar (anahtar, deger) VALUES (?, ?) ON DUPLICATE KEY UPDATE deger = VALUES(deger)')->execute([$anahtar, (string)round($v, 2)]);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'yer_kaydet') {
        $ad = metin($g['ad'] ?? null, 1, 60, 'ad');
        $tur = tur_girdi($g['tur'] ?? null);
        if (!empty($g['id'])) {
            $id = kimlik($g);
            $pdo->prepare('UPDATE emekli_yer SET ad = ?, tur = ? WHERE id = ?')->execute([$ad, $tur, $id]);
            cikis(200, ['ok' => true, 'id' => $id]);
        }
        // Yeni yer ilk konumuyla birlikte oluşturulur
        $n = nokta_girdi($g['nokta'] ?? null);
        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO emekli_yer (ad, tur, olusturma) VALUES (?, ?, ?)')->execute([$ad, $tur, simdi_utc()]);
        $id = (int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO emekli_yer_nokta (yer_id, etiket, enlem, boylam, yaricap_m) VALUES (?, ?, ?, ?, ?)')->execute(array_merge([$id], $n));
        $pdo->commit();
        cikis(200, ['ok' => true, 'id' => $id]);
    }
    if ($islem === 'nokta_kaydet') {
        $n = nokta_girdi($g['nokta'] ?? null);
        $yer = tamsayi($g['yerId'] ?? null, 1, 2000000000, 'yerId');
        $st = $pdo->prepare('SELECT COUNT(*) FROM emekli_yer WHERE id = ?');
        $st->execute([$yer]);
        if (!(int)$st->fetchColumn()) { hatali('yer_yok'); }
        if (!empty($g['id'])) {
            $pdo->prepare('UPDATE emekli_yer_nokta SET yer_id = ?, etiket = ?, enlem = ?, boylam = ?, yaricap_m = ? WHERE id = ?')->execute(array_merge([$yer], $n, [kimlik($g)]));
        } else {
            $pdo->prepare('INSERT INTO emekli_yer_nokta (yer_id, etiket, enlem, boylam, yaricap_m) VALUES (?, ?, ?, ?, ?)')->execute(array_merge([$yer], $n));
        }
        cikis(200, ['ok' => true, 'id' => $yer]);
    }
    if ($islem === 'yer_sil') {
        $id = kimlik($g);
        $pdo->prepare('DELETE FROM emekli_yer_nokta WHERE yer_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM emekli_yer WHERE id = ?')->execute([$id]);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'nokta_sil') {
        $pdo->prepare('DELETE FROM emekli_yer_nokta WHERE id = ?')->execute([kimlik($g)]);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'ozet_kaydet') {
        $liste = $g['gunler'] ?? null;
        if (!is_array($liste) || count($liste) > 100) { hatali('gunler'); }
        $st = $pdo->prepare('INSERT INTO emekli_gun (cihaz_adi, gun, adet, son_id, surum, veri, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?) '
            . 'ON DUPLICATE KEY UPDATE adet = VALUES(adet), son_id = VALUES(son_id), surum = VALUES(surum), veri = VALUES(veri), guncelleme = VALUES(guncelleme)');
        $pdo->beginTransaction();
        foreach ($liste as $x) {
            if (!is_array($x) || !is_array($x['veri'] ?? null)) { $pdo->rollBack(); hatali('gun_verisi'); }
            $st->execute([cihaz($x['cihaz'] ?? null), tarih($x['gun'] ?? null, 'gun'), tamsayi($x['adet'] ?? null, 0, 10000000, 'adet'),
                tamsayi($x['sonId'] ?? null, 0, 9000000000000, 'sonId'), tamsayi($x['surum'] ?? null, 1, 1000, 'surum'), json_encode($x['veri']), simdi_utc()]);
        }
        $pdo->commit();
        cikis(200, ['ok' => true, 'yazilan' => count($liste)]);
    }
    if ($islem === 'etiket_kaydet') {
        $c = cihaz($g['cihaz'] ?? null);
        $t0 = tamsayi($g['t0'] ?? null, 0, 4000000000, 't0');
        $t1 = tamsayi($g['t1'] ?? null, $t0, 4000000000, 't1');
        $tur = $g['tur'] ?? '';
        if (!in_array($tur, ['', 'is', 'ozel', 'yok'], true)) { hatali('tur'); } // yok: otomatik kural bu yolculuğa uygulanmasın
        $notu = metin($g['not'] ?? '', 0, 200, 'not');
        $id = empty($g['id']) ? 0 : kimlik($g);
        if ($tur === '' && $notu === '') {
            if ($id) { $pdo->prepare('DELETE FROM emekli_yolculuk_etiket WHERE id = ?')->execute([$id]); }
            cikis(200, ['ok' => true, 'id' => null]);
        }
        $deger = [$c, gmdate('Y-m-d H:i:s', $t0), gmdate('Y-m-d H:i:s', $t1), $tur, $notu, simdi_utc()];
        if ($id) {
            $pdo->prepare('UPDATE emekli_yolculuk_etiket SET cihaz_adi = ?, baslangic = ?, bitis = ?, tur = ?, notu = ?, guncelleme = ? WHERE id = ?')->execute(array_merge($deger, [$id]));
        } else {
            $pdo->prepare('INSERT INTO emekli_yolculuk_etiket (cihaz_adi, baslangic, bitis, tur, notu, guncelleme) VALUES (?, ?, ?, ?, ?, ?)')->execute($deger);
            $id = (int)$pdo->lastInsertId();
        }
        cikis(200, ['ok' => true, 'id' => $id]);
    }
    if ($islem === 'arac_kaydet') {
        $pdo->prepare('INSERT INTO emekli_arac (cihaz_adi, km_taban, taban_zamani) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE km_taban = VALUES(km_taban), taban_zamani = VALUES(taban_zamani)')
            ->execute([cihaz($g['cihaz'] ?? null), tamsayi($g['km'] ?? null, 0, 5000000, 'km'), simdi_utc()]);
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'bakim_kaydet') {
        $deger = [
            cihaz($g['cihaz'] ?? null), metin($g['ad'] ?? null, 1, 60, 'ad'),
            isset($g['aralikKm']) ? tamsayi($g['aralikKm'], 1, 1000000, 'aralikKm') : null,
            isset($g['aralikAy']) ? tamsayi($g['aralikAy'], 1, 600, 'aralikAy') : null,
            isset($g['sonKm']) ? tamsayi($g['sonKm'], 0, 5000000, 'sonKm') : null,
            isset($g['sonTarih']) ? tarih($g['sonTarih'], 'sonTarih') : null,
        ];
        if ($deger[2] === null && $deger[3] === null) { hatali('aralik'); }
        if (!empty($g['id'])) {
            $pdo->prepare('UPDATE emekli_bakim SET cihaz_adi = ?, ad = ?, aralik_km = ?, aralik_ay = ?, son_km = ?, son_tarih = ? WHERE id = ?')->execute(array_merge($deger, [kimlik($g)]));
        } else {
            $pdo->prepare('INSERT INTO emekli_bakim (cihaz_adi, ad, aralik_km, aralik_ay, son_km, son_tarih) VALUES (?, ?, ?, ?, ?, ?)')->execute($deger);
        }
        cikis(200, ['ok' => true]);
    }
    if ($islem === 'bakim_sil') {
        $pdo->prepare('DELETE FROM emekli_bakim WHERE id = ?')->execute([kimlik($g)]);
        cikis(200, ['ok' => true]);
    }
    cikis(400, ['ok' => false, 'hata' => 'islem']);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
    // 42S02: tablo yok -> migrasyon henüz çalıştırılmamış
    if ($e instanceof PDOException && (string)$e->getCode() === '42S02') { cikis(503, ['ok' => false, 'hata' => 'tablo_yok']); }
    error_log('emeklirobot ozellik: ' . $e->getMessage());
    cikis(500, ['ok' => false, 'hata' => 'sunucu']);
}
