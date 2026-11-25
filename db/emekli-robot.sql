-- EmekliRobot: araç takip logları
-- Hedef: MariaDB 5.5.68 (phpMyAdmin > veritabanı marmaraofisetiket_net_emeklirobot > SQL sekmesi)
-- Notlar:
--  * MariaDB 5.5: JSON tipi ve DATETIME(n) kesirli saniye YOK; tüm zamanlar saniye hassasiyetinde, UTC saklanır.
--  * Kayıt UUID'si UNIQUE: aynı kayıt iki kez gelirse INSERT IGNORE ile sessizce atlanır (idempotency).
--  * Bu dosya deploy'a girmez (workflow'da hariç); phpMyAdmin'den elle çalıştırılır.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `emekli_log` (
  `id`                    BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `kayit`                 CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL COMMENT 'Telefonun ürettiği UUID (küçük harf)',
  `cihaz_adi`             VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `log_tipi`              VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `enlem`                 DECIMAL(10,7)    NULL,
  `boylam`                DECIMAL(10,7)    NULL,
  `dogruluk_m`            DECIMAL(8,2)     NULL COMMENT 'Konum doğruluğu (metre)',
  `pil_yuzdesi`           TINYINT UNSIGNED NULL,
  `sarjda_mi`             TINYINT(1)       NULL,
  `pil_sicakligi`         DECIMAL(4,1)     NULL COMMENT 'Derece C, 0.1 hassasiyet',
  `arac_hareketli`        TINYINT(1)       NULL COMMENT '1 hareket, 0 duragan',
  `konum_zamani`          DATETIME         NOT NULL COMMENT 'Cihaz saatine göre (UTC\'ye çevrilmiş); saat sapması olabilir',
  `konum_zamani_ofset_dk` SMALLINT         NOT NULL DEFAULT 0 COMMENT 'Telefonun gönderdiği orijinal UTC ofseti (dk)',
  `elapsed_realtime_ms`   BIGINT UNSIGNED  NOT NULL,
  `konum_yasi_ms`         BIGINT UNSIGNED  NULL,
  `duzeltilmis_zaman`     DATETIME         NULL COMMENT 'Sunucu saatine göre düzeltilmiş olay zamanı (UTC)',
  `zaman_kaynagi`         VARCHAR(10) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT 'YOK' COMMENT 'ELAPSED | CIHAZ | YOK',
  `alinma_zamani`         DATETIME         NOT NULL COMMENT 'Sunucunun kaydı aldığı an (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kayit` (`kayit`),
  KEY `ix_cihaz_konum` (`cihaz_adi`, `konum_zamani`),
  KEY `ix_tip_konum` (`log_tipi`, `konum_zamani`),
  KEY `ix_cihaz_duzeltilmis` (`cihaz_adi`, `duzeltilmis_zaman`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Okuma kolaylığı: düzeltilmiş zaman varsa onu, yoksa cihaz zamanını gösterir (UTC).
CREATE OR REPLACE VIEW `emekli_log_v` AS
SELECT l.*, COALESCE(l.`duzeltilmis_zaman`, l.`konum_zamani`) AS `zaman`
FROM `emekli_log` l;
