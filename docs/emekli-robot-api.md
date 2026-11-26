# EmekliRobot API Sözleşmesi (v1)

Android uygulaması (EmekliRobot, cihaz `EmektarNote9`) ↔ sunucu (`marmaraofisetiket.net`). Telefon logları yerelde biriktirir, internet bulunca partiler halinde gönderir; sunucu **200** dönerse telefon o partideki **tüm** kayıtları siler.

## 1. Genel

| | |
|---|---|
| Taban adres | `https://marmaraofisetiket.net/api/emekli/` |
| Uç noktalar | `GET ping.php`, `POST kayitlar.php`, `GET komut.php`, `POST anlik.php` (v1.1), `GET surum.php`, `GET|HEAD indir.php` (v1.2) |
| Protokol | **Yalnızca HTTPS.** `http://` istekleri 301 ile yönlendirilir ve POST gövdesi kaybolur; telefon doğrudan `https://` kullanmalı. Yönlendirmeyi (3xx) başarı sayma. |
| Alan adı | `www` **yok**: `marmaraofisetiket.net` |
| Gövde | UTF-8 JSON, `Content-Type: application/json` |
| Kimlik doğrulama | Her istekte `X-Api-Key: <anahtar>` başlığı (aşağıda §2) |
| Zaman dilimi | Sunucu zamanları UTC (`...Z`). Kayıtlardaki `konumZamani` telefonun saat dilimiyle gelir. |
| Zaman aşımı önerisi | Bağlantı 10 sn, okuma 30 sn |

## 2. Kimlik doğrulama

- Başlık: `X-Api-Key: <anahtar>`. Anahtar telefonda ayarlardan girilir, **koda/repoya yazılmaz**.
- Eksik/yanlış anahtar → **401** `yetkisiz`.
- Sunucuda anahtar tanımlı değilse → **503** `sunucu_yapilandirmasi_eksik`.
- Anahtar sunucuda GitHub secret `EMEKLI_API_KEY` ile üretilir (`config.local.php`). Üretmek için: `openssl rand -hex 32`.

## 3. Ping — `GET /api/emekli/ping.php`

"Bağlantıyı test et" butonu içindir. Anahtarı, sunucuyu ve veritabanını doğrular. Gövde yok.

**200**
```json
{
  "ok": true,
  "servis": "emekli-robot",
  "surum": 1,
  "sunucuZamani": "2026-11-25T11:03:09Z",
  "sunucuUnixMs": 1795691789123,
  "veritabani": "ok"
}
```

| Durum | `hata.kod` | Anlamı (butonda gösterilecek) |
|---|---|---|
| 401 | `yetkisiz` | API anahtarı yanlış |
| 405 | `yontem_desteklenmiyor` | GET dışı yöntem |
| 503 | `veritabani_hatasi` | Sunucu var, veritabanı yok |
| 503 | `sunucu_yapilandirmasi_eksik` | Sunucuda anahtar tanımlı değil |
| ağ hatası / zaman aşımı | — | İnternet yok / sunucuya ulaşılamıyor |

`sunucuUnixMs` ile telefon saat sapmasını bilgi amaçlı gösterebilir.

## 4. Toplu kayıt — `POST /api/emekli/kayitlar.php`

### İstek

```json
{
  "gonderimElapsedRealtime": 86400000,
  "gonderimZamani": "2026-11-25T14:30:00+03:00",
  "kayitlar": [
    {
      "kayit": "3f2b8c9e-6a1d-4c7e-9b52-0e8a1d4f7c33",
      "cihazAdi": "EmektarNote9",
      "logTipi": "KONUM",
      "enlem": 41.0082376,
      "boylam": 28.9783589,
      "dogruluk": 6.5,
      "hizKmh": 42.3,
      "yon": 187.5,
      "pilYuzdesi": 83,
      "sarjdaMi": true,
      "pilSicakligi": 31.4,
      "aracHareketli": true,
      "konumZamani": "2026-11-25T14:03:07+03:00",
      "elapsedRealtime": 85200000,
      "konumYasiMs": 1200
    },
    {
      "kayit": "a91c0d57-2e44-4f0b-8d6a-5b7e3c1f9a02",
      "cihazAdi": "EmektarNote9",
      "logTipi": "KONUM_ALINAMADI",
      "enlem": null,
      "boylam": null,
      "dogruluk": null,
      "pilYuzdesi": 83,
      "sarjdaMi": true,
      "pilSicakligi": 31.6,
      "aracHareketli": true,
      "konumZamani": "2026-11-25T14:03:22+03:00",
      "elapsedRealtime": 85215000,
      "konumYasiMs": null
    }
  ]
}
```

**Zarf alanları**

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `kayitlar` | dizi | evet | 1–**500** kayıt. Boş dizi → 400. |
| `gonderimElapsedRealtime` | tamsayı (ms) | evet | Telefonun bu **gönderim denemesindeki** `SystemClock.elapsedRealtime()` değeri. **Her deneme (yeniden deneme dahil) için yeniden okunmalı.** |
| `gonderimZamani` | ISO 8601, saat dilimli | hayır | Telefonun gönderim anındaki duvar saati. Yalnızca cihaz yeniden başlamışsa yedek düzeltme için kullanılır. Önerilir. |

**Kayıt alanları** (`null` = "alan var, değeri yok"; alan hiç gönderilmezse de `null` sayılır)

| Alan | Tip | Zorunlu | Kural |
|---|---|---|---|
| `kayit` | string UUID | evet | `8-4-4-4-12` onaltılık. Idempotency anahtarı. Telefon kaydı oluştururken **bir kez** üretir, yeniden denemelerde **aynı kalır**. Sunucu küçük harfe çevirir. |
| `cihazAdi` | string | evet | 1–50 karakter, yalnızca `A-Z a-z 0-9 _ -`. Şu an `EmektarNote9`. |
| `logTipi` | string | evet | §5'teki değerlerden biri (büyük harf, ASCII). Bilinmeyen tip → 422. |
| `enlem` | sayı | hayır | −90…90. `boylam` ile **birlikte** dolu ya da birlikte `null`. |
| `boylam` | sayı | hayır | −180…180. |
| `dogruluk` | sayı (m) | hayır | 0…1 000 000. |
| `hizKmh` | sayı (km/sa) | hayır | GPS hızı, 0…400, 0.1 hassasiyet (fazlası yuvarlanır). Eski uygulama sürümleri göndermez; `null`/yok kabul. Aralık dışı → 422. |
| `yon` | sayı (derece) | hayır | Gidiş yönü, 0…359.9 (kuzeyden saat yönünde), 0.1 hassasiyet. Yalnızca `hizKmh > 2` iken anlamlıdır; sunucu yine de saklar. 360 ve üstü → 422. Yok/`null` kabul. |
| `pilYuzdesi` | tamsayı | hayır | 0…100. |
| `sarjdaMi` | bool | hayır | `true`/`false` (0/1 **değil**). |
| `pilSicakligi` | sayı (°C) | hayır | −50…150, 0.1 hassasiyet (fazlası yuvarlanır). |
| `aracHareketli` | bool | hayır | `true` = hareket, `false` = durağan. |
| `konumZamani` | string | evet | `KONUM`, `ARAC_HAREKET`, `ARAC_DURUYOR` kayıtlarında konum fix'inin kendi zamanı (`konumYasiMs` ≈ 0); `DURUM`, `SARJ_*`, `CIHAZ_*` ve `KONUM_ALINAMADI` kayıtlarında kayıt oluşturma zamanı (`DURUM` konumu son fix'lerin medyanıdır, `konumYasiMs` büyük olabilir). Saat dilimli ISO 8601, saniye hassasiyeti: `2026-11-25T14:03:07+03:00` (`Z` ve `.123` kesir de kabul; kesir atılır). Saat dilimsiz → 422. Konum alınamayan kayıtlarda da olay zamanı olarak zorunlu. |
| `elapsedRealtime` | tamsayı (ms) | evet | Kaydın **oluşturulduğu andaki** `SystemClock.elapsedRealtime()`. |
| `konumYasiMs` | tamsayı (ms) | hayır | Kayıt oluşturulduğunda konum fix'inin yaşı. Konum yoksa `null`. |

Bilinmeyen ek alanlar yok sayılır (eski/yeni uygulama sürümleri birlikte çalışır).

### Başarı — **200**

```json
{
  "ok": true,
  "alinan": 2,
  "eklenen": 1,
  "tekrar": 1,
  "sunucuZamani": "2026-11-25T11:30:01Z"
}
```

- `alinan` = partideki kayıt sayısı, `eklenen` = yeni yazılan, `tekrar` = daha önce zaten kayıtlı olduğu için sessizce atlanan.
- **200 = partideki tüm kayıtlar sunucuda kalıcı** (ya yeni yazıldı ya da zaten vardı). Telefon **bütün partiyi** siler.

### Hata yanıtı biçimi

```json
{ "ok": false, "hata": { "kod": "gecersiz_kayit", "mesaj": "1 hata bulundu; parti kaydedilmedi." } }
```

**422 `gecersiz_kayit`** ek olarak `hatalar` içerir:

```json
{
  "ok": false,
  "hata": { "kod": "gecersiz_kayit", "mesaj": "2 hata bulundu; parti kaydedilmedi." },
  "hatalar": [
    { "sira": 3, "kayit": "a91c0d57-2e44-4f0b-8d6a-5b7e3c1f9a02", "alan": "konumZamani", "neden": "saat dilimli ISO 8601 olmalı, örn. 2026-11-25T14:03:07+03:00" },
    { "sira": 7, "kayit": null, "alan": "kayit", "neden": "geçerli UUID değil" }
  ]
}
```

`sira` = `kayitlar` dizisindeki 0 tabanlı indeks. Bir kayıtta birden çok hata varsa birden çok satır olabilir.

### Hata kodları ve telefonun davranışı

| HTTP | `hata.kod` | Sebep | Telefon ne yapmalı |
|---|---|---|---|
| 200 | — | Parti tamam | Partiyi **sil** |
| 400 | `gecersiz_json`, `gecersiz_zarf`, `bos_govde`, `bos_parti` | Gövde/zarf bozuk | Bug. Silme; logla, kullanıcıya göster; tekrar deneme döngüsüne sokma |
| 401 | `yetkisiz` | Anahtar yanlış/eksik | Silme; "API anahtarı hatalı" göster; anahtar düzelene dek durdur |
| 405 | `yontem_desteklenmiyor` | POST dışı | Bug |
| 413 | `parti_cok_buyuk`, `govde_cok_buyuk` | >500 kayıt veya >2 MB | Partiyi küçült (örn. 200) ve yeniden dene |
| 415 | `icerik_tipi_desteklenmiyor` | Content-Type yanlış | Bug |
| 422 | `gecersiz_kayit` | En az bir kayıt geçersiz; **hiçbir kayıt yazılmadı** | `hatalar[].kayit`'te listelenen kayıtları ayır (karantina/hatalı işaretle veya sil), **kalan geçerli kayıtları yeniden gönder**. `kayit` null ise `sira`'ya bak. Geçerli kayıtları silme. |
| 500 | `sunucu_hatasi` | Yazma başarısız, işlem geri alındı | Silme; backoff ile **aynı partiyi** yeniden dene (güvenli, bkz. §6) |
| 503 | `veritabani_hatasi`, `sunucu_yapilandirmasi_eksik` | Sunucu hazır değil | Silme; backoff ile yeniden dene |
| 3xx | — | Yönlendirme (http→https vb.) | Başarı sayma, silme; adresi düzelt |
| ağ hatası / zaman aşımı | — | Yanıt alınamadı | **Silme**; yeniden dene. Sunucu partiyi yazmış olabilir; tekrar gönderim güvenlidir (§6) |

Önerilen backoff: 30 sn → 1 dk → 2 dk → … en çok 15 dk; internet geri gelince (ağ değişikliği) hemen dene.

## 5. Log tipleri

ASCII, büyük harf; Türkçe karakter yok.

| `logTipi` | Ne zaman | Konum | Notlar |
|---|---|---|---|
| `SARJ_BASLADI` | Şarj takıldı (kontak açıldı) | varsa | geçiş anı |
| `SARJ_KESILDI` | Şarj kesildi (kontak kapandı) | varsa | geçiş anı |
| `ARAC_HAREKET` | Araç durağandan harekete geçti | varsa | geçiş anı |
| `ARAC_DURUYOR` | Araç hareketten durağana geçti | varsa | geçiş anı |
| `KONUM` | Hareketteyken her 15 sn | evet | |
| `DURUM` | Durağanken her 15 dk | genelde | |
| `KONUM_ALINAMADI` | Konum alınamadı | **null** | `enlem/boylam/dogruluk/konumYasiMs` = null |
| `CIHAZ_ISINDI` | Pil ≥ 45 °C | varsa | |
| `CIHAZ_KRITIK_ISINDI` | Pil ≥ 48 °C | varsa | |
| `CIHAZ_SOGUDU` | Sıcaklık normale döndü | varsa | |

Yeni tip eklenirse **önce sunucudaki** `LOG_TIPLERI` listesi (`api/emekli/kayitlar.php`) güncellenmeli; yoksa 422 döner.

## 6. Idempotency kuralı

- `kayit` UUID'si veritabanında **UNIQUE**. Sunucu `INSERT IGNORE` kullanır: aynı UUID zaten varsa **hata vermez**, kaydı **yeniden işlemez/ezmez** (ilk gelen kalır) ve `tekrar` sayacına ekler.
- Aynı partide aynı UUID iki kez olsa da biri yazılır, diğeri `tekrar` sayılır.
- Bu yüzden telefon, yanıt alamadığı (zaman aşımı, bağlantı kopması) partiyi **aynen** yeniden gönderebilir. UUID'ler değişmemeli.
- Parti **hep-ya-da-hiç** yazılır (tek veritabanı işlemi): 200 dönmüşse hepsi kalıcıdır; 4xx/5xx dönmüşse bu istek hiçbir şey yazmamıştır (ağ hatasında belirsiz: bu durumda tekrar gönder).
- Kısmi başarı yoktur. Tek istisna sunucu yazmayı bitirdikten sonra yanıtın telefona ulaşmaması; çözüm yine tekrar göndermektir.

## 7. Saat sapması düzeltmesi

Telefonda SIM yok, saat ağdan düzelmez ve kayabilir. Sunucu her kayıt için `duzeltilmis_zaman` hesaplar (UTC, olay anı; ham `konumZamani` ayrıca saklanır):

1. **`ELAPSED`** (tercih): `gonderimElapsedRealtime − elapsedRealtime` ≥ 0 ve ≤ 90 gün ise
   `duzeltilmis_zaman = sunucuAnı − (gonderimElapsedRealtime − elapsedRealtime)`.
   Telefon yeniden başlamadıysa kesin doğrudur. Telefonun duvar saatine bağlı değildir.
2. **`CIHAZ`** (yedek): cihaz yeniden başlamışsa (fark negatif) ve `gonderimZamani` verilmişse
   `duzeltilmis_zaman = konumZamani + (sunucuAnı − gonderimZamani)` (sabit saat farkı varsayımı).
3. **`YOK`**: ikisi de mümkün değil; `duzeltilmis_zaman` NULL, analizde `konumZamani` kullanılır.

Konum fix'inin kendi zamanı ≈ `duzeltilmis_zaman − konumYasiMs`.
Telefona düşen kural: `elapsedRealtime` kayıt **oluşturulurken** okunup kayıtla birlikte saklanmalı; `gonderimElapsedRealtime` her gönderim denemesinde **o an** okunmalı.

## 8. Veritabanı özeti

MariaDB 5.5.68, veritabanı `marmaraofisetiket_net_emeklirobot`, tablo `emekli_log` (tam şema: `db/emekli-robot.sql`). Telefonun bilmesi gerekmez; JSON alan adları sütunlara şöyle eşlenir: `cihazAdi→cihaz_adi`, `logTipi→log_tipi`, `dogruluk→dogruluk_m`, `hizKmh→hiz_kmh`, `yon→yon`, `pilYuzdesi→pil_yuzdesi`, `sarjdaMi→sarjda_mi`, `pilSicakligi→pil_sicakligi`, `aracHareketli→arac_hareketli`, `konumZamani→konum_zamani (UTC)`, `elapsedRealtime→elapsed_realtime_ms`, `konumYasiMs→konum_yasi_ms`.

## 9. Örnek çağrılar

```bash
curl -s -H "X-Api-Key: $ANAHTAR" https://marmaraofisetiket.net/api/emekli/ping.php

curl -s -X POST https://marmaraofisetiket.net/api/emekli/kayitlar.php \
  -H "X-Api-Key: $ANAHTAR" -H "Content-Type: application/json" \
  -d '{"gonderimElapsedRealtime":86400000,"kayitlar":[{"kayit":"3f2b8c9e-6a1d-4c7e-9b52-0e8a1d4f7c33","cihazAdi":"EmektarNote9","logTipi":"SARJ_BASLADI","konumZamani":"2026-11-25T14:03:07+03:00","elapsedRealtime":85200000}]}'
```

## 10. Değişiklik geçmişi (v1 içinde geriye uyumlu eklemeler)

- 2026-11-25: kayıtlara isteğe bağlı `hizKmh` ve `yon` eklendi. Zorunlu alan değişmedi; yeni log tipi yok. `hizKmh`/`yon` yalnızca taze fix'li kayıtlarda (`KONUM`, `ARAC_*`) dolu, diğerlerinde `null`. Sunucuda `db/2026-11-25-hiz-yon.sql` migrasyonu gerekir.
- 2026-11-27 (v1.2): `GET surum.php` ve `GET|HEAD indir.php` eklendi (§13). Mevcut uç noktalar değişmedi.
- 2026-11-26 (v1.1): `GET komut.php` ve `POST anlik.php` eklendi (§12). Mevcut uç noktalar değişmedi. Sunucuda `db/2026-11-26-anlik.sql` migrasyonu gerekir.

## 12. Anlık durum komutu (v1.1) — "Bana son durumu göster"

Sitedeki panelden bir cihaz için anlık durum istenir. Akış: panel komut açar → telefon `komut.php`'yi yoklar, komutu görür → tüm bilgisini **bir kez** `anlik.php`'ye gönderir → panel (3 sn'de bir sorarak) sonucu gösterir. Anlık veri `emekli_log` tablosuna **girmez**; cihaz başına tek satır (`cihaz_anlik`) olarak üzerine yazılır. Migrasyon: `db/2026-11-26-anlik.sql` (tablolar `emekli_komut`, `cihaz_anlik`).

### 12.1 `GET /api/emekli/komut.php?cihazAdi=<ad>`
`X-Api-Key` gerekir. `cihazAdi`: 1-50 karakter `A-Za-z0-9_-` (aksi 422 `gecersiz_cihaz`).
```json
{"ok":true,"komut":null}
{"ok":true,"komut":{"id":123,"tip":"DURUM_ISTE","olusturma":"2026-11-26T09:00:00Z"}}
```
- Beklemede ve 30 dk'dan yeni komut varsa onu döner; 30 dk'dan eskiyi `ZAMAN_ASIMI` yapıp `null` döner.
- Komut, `anlik.php` ile cevaplanana (veya zaman aşımına) kadar her yoklamada aynen döner.

### 12.2 `POST /api/emekli/anlik.php`
```json
{"komutId":123,"cihazAdi":"EmektarNote9","gonderimElapsedRealtime":86400000,
 "anlik":{"surum":"1.4","anlikZamani":"2026-11-26T12:00:00+03:00","enlem":41.0082,"boylam":28.9784,"dogruluk":6.5,
  "konumYasiMs":1200,"hizKmh":0,"yon":null,"pilYuzdesi":77,"sarjdaMi":true,"pilSicakligi":33.1,"aracHareketli":false,
  "termal":"NORMAL","gpsModu":"HIGH","bekleyenKayit":12,"sonGonderimZamani":"2026-11-26T11:58:00+03:00",
  "hareketSensoru":true,"sensorTetiklenme":3,"reddedilenKonum":0,"sonCokme":null}}
```
- `anlik` alanlarının hepsi `null`/eksik olabilir; **yalnız `anlikZamani` zorunlu** (saat dilimli ISO 8601). `komutId` `null` olabilir (komutsuz anlık).
- Tipler: `surum` metin(≤50), `enlem/boylam` birlikte dolu ya da null, `dogruluk` 0..1000000, `hizKmh` 0..400, `yon` 0..359.99, `pilYuzdesi` 0..100 tamsayı, `pilSicakligi` -50..150, `sarjdaMi/aracHareketli/hareketSensoru` bool, `termal` `NORMAL|ISINMIS|KRITIK`, `gpsModu` metin(≤50), `bekleyenKayit/sensorTetiklenme/reddedilenKonum/konumYasiMs` tamsayı ≥ 0, `sonGonderimZamani` ISO 8601, `sonCokme` metin (≤300; fazlası kesilir). Bilinmeyen alanlar yok sayılır.
- **200** `{"ok":true}`: komut `TAMAM` yapılır ve `cihaz_anlik` satırı UPSERT edilir. Aynı `komutId` tekrar gelirse hata yok. `komutId` bilinmiyor / zaman aşımına uğramış / başka cihazın ise yine **200** ve yine UPSERT (komut durumu değişmez).
- **422** `gecersiz_anlik` (`hatalar` listesiyle; hiçbir şey yazılmaz), **401** anahtar yanlış, **400/413/415** gövde sorunları (kayitlar.php ile aynı).

### 12.3 Kurallar
- Bir cihaz için aynı anda **tek** bekleyen komut. Beklerken siteden tekrar basılırsa yeni komut açılmaz, mevcudun `olusturma` zamanı yenilenir (10 kez basılsa tek cevap).
- Geçerlilik 30 dk (son basıştan itibaren). Zaman aşımına uğrayan komuta geç cevap verilse de panelde "zaman aşımı" görünür; veri yine son durum olarak saklanır.
- Telefon önerisi: internet varken ve uygulama çalışırken ~1 dk'da bir `komut.php`'yi yokla (SIM yok; Wi-Fi bağlıyken gecikme ≈ 1 dk). Komut gelince tek `anlik.php` gönder; 200 alınca bırak. 5xx/ağ hatasında aynı komutla yeniden dene.

## 13. Uygulama güncelleme dağıtımı (v1.2)

Telefondaki "Güncellemeyi kontrol et" için: sunucu yalnızca yayındaki sürümü bildirir ve APK'yı akıtır. Yükleme ve imza doğrulaması telefonda yapılır.

### 13.1 `GET /api/emekli/surum.php`
`X-Api-Key` gerekir; yalnızca GET (aksi 405, `Allow: GET`).
```json
{"ok":true,"versionCode":107,"versionName":"1.0.7","sha256":"<64 hex küçük harf>","boyut":16644129,"notlar":"..."}
```
- Kaynak `api/emekli/yayin/surum.json`. Doğrulama: `versionCode` tamsayı > 0, `versionName` 1-20 karakter, `sha256` tam 64 hex (küçük harfe çevrilir), `boyut` tamsayı > 0, `notlar` en çok 500 karakter (yoksa `""`).
- Dosya yok ya da geçersiz → **404** `surum_yok` (geçersizse sunucu günlüğüne `error_log`). 401 anahtar yanlış.
- Telefon önerisi: `versionCode` kendi sürümünden büyükse güncelleme vardır.

### 13.2 `GET|HEAD /api/emekli/indir.php`
`X-Api-Key` gerekir. `api/emekli/yayin/emekli.apk` dosyasını akıtır: `Content-Type: application/vnd.android.package-archive`, `Content-Length`, `Content-Disposition: attachment; filename="emekli.apk"`, `Cache-Control: no-store`. HEAD yalnızca başlıkları döner. Dosya yok → **404** `apk_yok`. Range desteklenmez (`Accept-Ranges: none`); kesilen indirme baştan alınır.
- Telefon indirdikten sonra dosyanın SHA-256'sını hesaplayıp `surum.php`'deki `sha256` ile karşılaştırmalı; uyuşmazsa APK'yı silmeli ve kurmamalı.

### 13.3 Yayın klasörü ve elle yayınlama
- Klasör: `api/emekli/yayin/` (sunucuda). İçine **FTP ile elle** `emekli.apk` ve `surum.json` atılır. APK repoya girmez (`.gitignore`), GitHub Actions bunları ne yükler ne siler.
- Klasöre doğrudan web erişimi kapalıdır (`.htaccess`: `Require all denied` + eski Apache için `Deny from all`); dosyalara yalnızca `surum.php` / `indir.php` erişir.
- SHA-256 üretmek: `shasum -a 256 emekli.apk` (macOS) / `sha256sum emekli.apk` (Linux). Boyut: `stat -f%z emekli.apk` (macOS) / `stat -c%s emekli.apk` (Linux).
- Örnek `surum.json`:
```json
{"versionCode":107,"versionName":"1.0.7","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","boyut":16644129,"notlar":"Konum doğruluğu iyileştirmeleri."}
```
- Sıra: önce `emekli.apk`, **sonra** `surum.json` yüklenir (telefon yeni sürümü görünce APK hazır olsun). Yeni sürümde ikisi de üzerine yazılır.

## 14. Sürüm notu

Bu sözleşme v1'dir. Geriye dönük uyumsuz değişiklikte yeni yol (`/api/emekli/v2/`) açılır; mevcut telefon uygulaması bozulmaz.
