-- "Bana son durumu göster" özelliği (API v1.1): komut kuyruğu + cihaz başına son anlık durum.
-- Hedef: MariaDB 5.5 (phpMyAdmin > SQL). Deploy'a girmez; elle çalıştırılır. Tekrar çalıştırılabilir.
SET NAMES utf8mb4;

-- Cihaz başına aynı anda en çok TEK bekleyen komut: `bekleyen` bekleyende 1, bittiğinde NULL;
-- UNIQUE(cihaz_adi, bekleyen) NULL'ları serbest bıraktığından geçmiş satırlar çakışmaz.
CREATE TABLE IF NOT EXISTS `emekli_komut` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cihaz_adi`   VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `tip`         VARCHAR(20) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'DURUM_ISTE',
  `durum`       VARCHAR(12) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'BEKLIYOR' COMMENT 'BEKLIYOR | TAMAM | ZAMAN_ASIMI',
  `bekleyen`    TINYINT NULL DEFAULT 1 COMMENT '1 = bekliyor, NULL = bitti',
  `olusturma`   DATETIME NOT NULL COMMENT 'UTC; tekrar basılınca yenilenir (geçerlilik 30 dk)',
  `tamamlanma`  DATETIME NULL COMMENT 'UTC',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cihaz_bekleyen` (`cihaz_adi`, `bekleyen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cihaz başına tek satır: son anlık durum (log değildir, üzerine yazılır).
CREATE TABLE IF NOT EXISTS `cihaz_anlik` (
  `cihaz_adi`     VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `veri`          TEXT NOT NULL COMMENT 'JSON (MariaDB 5.5: JSON tipi yok)',
  `komut_id`      BIGINT UNSIGNED NULL,
  `alinma_zamani` DATETIME NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`cihaz_adi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
