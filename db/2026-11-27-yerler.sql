-- Panel özellikleri: kayıtlı yerler, günlük özetler (rapor/yolculuklar), yolculuk etiketleri, bakım hatırlatıcı.
-- Hedef: MariaDB 5.5 (phpMyAdmin > veritabanı marmaraofisetiket_net_emeklirobot > SQL). Deploy'a girmez; elle çalıştırılır.
-- Tekrar çalıştırılabilir (mevcut veriye dokunmaz). emekli_log değişmez.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `emekli_yer` (
  `id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ad`        VARCHAR(60)  NOT NULL,
  `tur`       VARCHAR(8) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'diger' COMMENT 'ev | is | diger',
  `olusturma` DATETIME     NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bir yerin birden fazla konumu olabilir (bina, otopark, sokak parkı...).
CREATE TABLE IF NOT EXISTS `emekli_yer_nokta` (
  `id`        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `yer_id`    INT UNSIGNED  NOT NULL,
  `etiket`    VARCHAR(40)   NOT NULL DEFAULT '',
  `enlem`     DECIMAL(10,7) NOT NULL,
  `boylam`    DECIMAL(10,7) NOT NULL,
  `yaricap_m` SMALLINT UNSIGNED NOT NULL DEFAULT 150,
  PRIMARY KEY (`id`),
  KEY `ix_yer` (`yer_id`),
  CONSTRAINT `fk_nokta_yer` FOREIGN KEY (`yer_id`) REFERENCES `emekli_yer` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cihaz ve gün (Türkiye saati) başına özet. Panel (tarayıcı) hesaplayıp yazar; ham loglar silinse de rapor kalır.
CREATE TABLE IF NOT EXISTS `emekli_gun` (
  `cihaz_adi`  VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `gun`        DATE NOT NULL,
  `adet`       INT UNSIGNED NOT NULL COMMENT 'Özet hesaplanırken o günün ham kayıt sayısı',
  `son_id`     BIGINT UNSIGNED NOT NULL COMMENT 'Özet hesaplanırken o günün en büyük emekli_log.id değeri',
  `surum`      SMALLINT UNSIGNED NOT NULL COMMENT 'Özet algoritması sürümü',
  `veri`       MEDIUMTEXT NOT NULL COMMENT 'JSON',
  `guncelleme` DATETIME NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`cihaz_adi`, `gun`),
  KEY `ix_gun` (`gun`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Yolculuk defteri. Yolculuklar hesaplandığı için kimlik yerine zaman aralığıyla eşleştirilir.
CREATE TABLE IF NOT EXISTS `emekli_yolculuk_etiket` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cihaz_adi`  VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `baslangic`  DATETIME NOT NULL COMMENT 'UTC',
  `bitis`      DATETIME NOT NULL COMMENT 'UTC',
  `tur`        VARCHAR(8) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '' COMMENT 'is | ozel | boş',
  `notu`       VARCHAR(200) NOT NULL DEFAULT '',
  `guncelleme` DATETIME NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`id`),
  KEY `ix_cihaz_bas` (`cihaz_adi`, `baslangic`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Araç kilometresi: elle girilen değer + o andan sonraki GPS mesafesi.
CREATE TABLE IF NOT EXISTS `emekli_arac` (
  `cihaz_adi`    VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `km_taban`     INT UNSIGNED NOT NULL,
  `taban_zamani` DATETIME NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`cihaz_adi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `emekli_bakim` (
  `id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cihaz_adi` VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `ad`        VARCHAR(60) NOT NULL,
  `aralik_km` INT UNSIGNED NULL,
  `aralik_ay` SMALLINT UNSIGNED NULL,
  `son_km`    INT UNSIGNED NULL,
  `son_tarih` DATE NULL,
  PRIMARY KEY (`id`),
  KEY `ix_cihaz` (`cihaz_adi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
