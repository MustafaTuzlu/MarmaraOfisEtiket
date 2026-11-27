-- Panel: İş/Özel kuralları, masraf defteri, panel ayarları, veritabanı işlem geçmişi.
-- Hedef: MariaDB 5.5 (phpMyAdmin > veritabanı marmaraofisetiket_net_emeklirobot > SQL). Deploy'a girmez; elle çalıştırılır.
-- db/2026-11-27-yerler.sql'den SONRA çalıştırılır. Tekrar çalıştırılabilir (mevcut veriye dokunmaz).
SET NAMES utf8mb4;

-- Otomatik İş/Özel kuralı. kaynak/hedef: 'yer:<id>' | 'tur:ev|is|diger' | '*'
CREATE TABLE IF NOT EXISTS `emekli_kural` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kaynak`  VARCHAR(20) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `hedef`   VARCHAR(20) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `iki_yon` TINYINT(1)  NOT NULL DEFAULT 1,
  `tur`     VARCHAR(8) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL COMMENT 'is | ozel',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `emekli_masraf` (
  `id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cihaz_adi` VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `tarih`     DATE NOT NULL,
  `tur`       VARCHAR(8) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL COMMENT 'yakit | otopark | kopru | bakim | diger',
  `tutar`     DECIMAL(10,2) NOT NULL,
  `litre`     DECIMAL(7,2) NULL,
  `km`        INT UNSIGNED NULL COMMENT 'Gösterge km',
  `notu`      VARCHAR(200) NOT NULL DEFAULT '',
  `olusturma` DATETIME NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`id`),
  KEY `ix_tarih` (`tarih`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tarayıcılar arası ortak ayarlar (km ücreti, saklama süresi, gece saatleri...)
CREATE TABLE IF NOT EXISTS `emekli_ayar` (
  `anahtar` VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `deger`   VARCHAR(100) NOT NULL,
  PRIMARY KEY (`anahtar`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Panelden yapılan silme/optimize/yedek işlemleri (panelden silinemez)
CREATE TABLE IF NOT EXISTS `emekli_islem_log` (
  `id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `zaman`  DATETIME NOT NULL COMMENT 'UTC',
  `islem`  VARCHAR(12) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `hedef`  VARCHAR(300) NOT NULL,
  `adet`   BIGINT UNSIGNED NULL,
  `ip`     VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
