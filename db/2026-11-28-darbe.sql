-- Darbe adayları (API v1.3): telefonun gönderdiği olay özeti + GPS izi. Ham sensör dalgası sunucuya gelmez.
-- Hedef: MariaDB 5.5 (phpMyAdmin > SQL). Deploy'a girmez; elle çalıştırılır. Tekrar çalıştırılabilir.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `emekli_darbe` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`              CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL COMMENT 'telefondaki olay kimliği; tekrar gelirse satır güncellenir',
  `cihaz_adi`         VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `zaman`             DATETIME NOT NULL COMMENT 'ilk tetikleme, telefon saati (UTC)',
  `zaman_ofset_dk`    SMALLINT NOT NULL DEFAULT 0,
  `duzeltilmis_zaman` DATETIME NULL COMMENT 'UTC; yalnız ilk eklemede hesaplanır',
  `zaman_kaynagi`     VARCHAR(8) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'YOK',
  `asama`             VARCHAR(6) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `etiket`            VARCHAR(24) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `gercek_durum`      VARCHAR(16) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  `tepe_g`            DOUBLE NOT NULL,
  `veri`              TEXT NOT NULL COMMENT 'JSON: özet alanlar (MariaDB 5.5: JSON tipi yok)',
  `gps`               MEDIUMTEXT NOT NULL COMMENT 'JSON: [[tMs,enlem,boylam,hiz,yon,dogruluk,uydu,reddedildi],...]',
  `gps_adet`          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `ilk_alinma`        DATETIME NOT NULL COMMENT 'UTC',
  `son_alinma`        DATETIME NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_uuid` (`uuid`),
  KEY `ix_zaman` (`zaman`),
  KEY `ix_cihaz_zaman` (`cihaz_adi`, `zaman`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
