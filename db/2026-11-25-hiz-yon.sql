-- Mevcut emekli_log tablosuna hız ve yön ekler. YALNIZCA BİR KEZ çalıştırın (MariaDB 5.5'te IF NOT EXISTS yok).
-- ÖNEMLİ: Bu betik, kodun (kayitlar.php / panel) deploy'undan ÖNCE çalıştırılmalı; yoksa API 500 döner.
ALTER TABLE `emekli_log`
  ADD COLUMN `hiz_kmh` DECIMAL(4,1) NULL COMMENT 'GPS hızı km/sa (0..400)' AFTER `dogruluk_m`,
  ADD COLUMN `yon`     DECIMAL(4,1) NULL COMMENT 'Gidiş yönü, derece 0..359.9 (hız > 2 iken anlamlı)' AFTER `hiz_kmh`;

-- Görünüm sütun listesini oluşturulduğu anda dondurur; yeni sütunlar için yeniden oluştur.
CREATE OR REPLACE VIEW `emekli_log_v` AS
SELECT l.*, COALESCE(l.`duzeltilmis_zaman`, l.`konum_zamani`) AS `zaman`
FROM `emekli_log` l;
