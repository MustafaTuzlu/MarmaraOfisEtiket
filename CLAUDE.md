# Marmara Ofis Etiket – Proje Hafızası (CLAUDE.md)

Bu dosya, projede çalışan yapay zekâ (Claude) ve geliştiriciler için kalıcı hafızadır. Büyük bir iş yaptıktan sonra **"Yapılanlar"** ve **"Yapılacaklar"** bölümlerini güncelle. Kullanıcı Türkçe konuşur, yanıtlar Türkçe olmalı.

## 1. Proje özeti
- **Firma:** Marmara Ofis Etiket – barkod yazıcı, etiket, ribon, el terminali, barkod okuyucu. Özel ölçü etiket üretimi.
- **Adres:** Merkez Mah. Eskibağlar Caddesi No:22 Halkalı – İstanbul
- **İletişim:** `+90 536 507 26 11` (telefon + WhatsApp, `tel:+905365072611`, `https://wa.me/905365072611`), `info@marmaraofisetiket.net`. **Faks kaldırıldı**, tekrar eklenmeyecek.
- **Kanonik alan adı:** `https://marmaraofisetiket.net` (https, **www'suz**). Eski `marmaraofis.net` hiçbir yerde kullanılmaz.
- **Marka yazımı:** Her yerde **"Marmara Ofis Etiket"**. Tek istisna: şemalardaki `alternateName: "Marmara Ofis"`. (Hakkımızda metnindeki "Marmara ofset" olduğu gibi kalır.)
- **Sahip/muhatap:** Bülent Seven (İşletme Sahibi). **Yalnızca JSON-LD'de** (`employee` + `contactPoint.name`), sayfada görünür metin olarak **geçmez**; kullanıcı böyle istedi.

## 2. Teknoloji ve yapı
- Statik HTML (ASP.NET'ten dışa aktarılmış), Bootstrap, Revolution Slider, jQuery. Derleme adımı yok.
- Dosya sonları **CRLF**. Python ile düzenlerken `open(..., newline='')` kullan, yoksa tüm dosyalarda satır sonu diff'i çıkar.
- Diller: `tr/` (varsayılan, ana sayfa `index.html`), `en/` + `en.html`, `de/` + `de.html` (DE yalnızca ana sayfa + `de/iletisim.html`).
  - TR: `tr/urun/` (ürün), `tr/urunlerimiz/` (kategori), `tr/hakkimizda.html`, `vizyon-misyon`, `kalite-politikamiz`, `kariyer`, `iletisim`.
  - EN: `en/product/`, `en/products/`, `about-us`, `contact-us`, `career`, `vision-mission`, `our-quality-and-environmental-policy`.
- Kök dosyalar: `.htaccess`, `robots.txt`, `sitemap.xml`, `404.html`, `arama.php` (site içi arama, `noindex`), `mail.php` + `config.php` (iletişim formu, SMTP), `Upload/` (görseller), `css/style.css`, `orijinal/` (eski yedek, deploy'a girmez, `robots.txt`'te engelli).
- Ortak şablon yok: header, footer ve menü **her HTML dosyasına gömülü**. Toplu değişiklik gerekiyorsa Python betiğiyle tüm sayfalara uygula, sonra doğrula.
- Sunucu: LiteSpeed/Apache. Hosting SMTP: `mail.kurumsaleposta.com:465 (SSL)`.

## 3. Deploy
- `main` dalına push → GitHub Actions **"Deploy to FTP"** (`.github/workflows/deploy-ftp.yml`) → FTP ile yayın. `orijinal/`, `.github`, `.DS_Store`, `README.md` hariç.
- SMTP şifresi GitHub secret'ında (`SMTP_PASS`); iş akışı `config.local.php` üretir. **Şifreleri repoya yazma.**
- Bu makinede `gh` girişsiz, PR açılamaz; değişiklikler doğrudan `main`'e gider. Kullanıcı "push" ya da "deploy" demedikçe **push etme**; commit mesajlarında Claude ortak yazar satırı kullanılır.
- Deploy sonrası kontrol: `https://marmaraofisetiket.net/robots.txt`, `/sitemap.xml`, http→https ve www→non-www yönlendirmesi.

## 3b. EmekliRobot API (araç takip)
- Sözleşme: `docs/emekli-robot-api.md`. Uç noktalar: `api/emekli/ping.php` (GET), `api/emekli/kayitlar.php` (POST, toplu, idempotent). Şema: `db/emekli-robot.sql` (MariaDB 5.5, phpMyAdmin'den elle çalıştırılır; deploy'a girmez).
- Gizli bilgiler yalnızca GitHub secret/variable → `config.local.php`: secret `EMEKLI_DB_PASS`, `EMEKLI_API_KEY`; variable (opsiyonel) `EMEKLI_DB_HOST/PORT/NAME/USER`. Repoya yazma.
- **İndekslenmemeli:** `/api/` hiçbir zaman sitemap'e, sayfa bağlantılarına girmez. Korumalar: `robots.txt` `Disallow: /api/`, `api/emekli/.htaccess` ve PHP yanıtlarında `X-Robots-Tag: noindex, nofollow`. Bunları kaldırma.
- Durum: sunucu canlı ve test edildi (ping, kayıt ekleme, mükerrer atlama). Açık karar: geçersiz kayıtta tüm parti 422 ile reddedilir (alternatif: geçerlileri yaz, hatalıları raporla).

## 4. SEO kuralları (mevcut durum – bozma)
- **Her sayfada:** benzersiz `<title>` (sonu `| Marmara Ofis Etiket`), `meta description` (≤160 karakter), `robots`, `canonical` (tam https URL), `hreflang` (tr / en / de + `x-default` → TR), Open Graph + Twitter Card, JSON-LD, tek `<h1>`, tüm `<img>` için `alt`.
- **hreflang eşleşmesi:** TR ve EN ürün sayfaları ana ürün görselinin dosya adı üzerinden eşlenir. DE'de yalnızca ana sayfa ve iletişim eşleşir.
- **JSON-LD:** ana sayfalarda `Organization/LocalBusiness` (`geo`, `hasMap`, `contactPoint`, `employee`) + `WebSite` (+SearchAction); sayfa türüne göre `BreadcrumbList`, `Product` (minimal `offers`: `url` + `seller`, **fiyat yok**), `CollectionPage` + `ItemList` (kategoriler), `ContactPage`. Değiştirirken JSON'un geçerli kaldığını `json.loads` ile doğrula.
- **Sitemap elle tutulur:** `sitemap.xml` otomatik üretilmiyor. Yeni sayfa eklenince sitemap'e `<loc>` + hreflang `xhtml:link` alternatifleri eklenmeli. `lastmod` bilerek yok (sahte tarih vermemek için).
- **Yönlendirmeler (`.htaccess`):** http→https, www→non-www, `/index.html`→`/`, eski/yinelenen sayfalar → kanonik sayfa (301), `ErrorDocument 404 /404.html`. Güvenlik başlıkları: nosniff, HSTS (`max-age=31536000`), Referrer-Policy, X-Frame-Options.
- **Kategori sayfaları** (TR 17, EN 5) üstünde `.category-intro` giriş metni vardır (ürün listesinin üstünde). Ana sayfalarda (`index.html`, `en.html`, `de.html`) `.seo-intro` bölümü ve `<h2>` başlıkları vardır.
- **Performans kuralları:** görsellere `width`/`height`; ilk 2 içerik görseli hariç `loading="lazy" decoding="async"` (slider, logo, bayraklar hariç); tüm yerel `<script src>` etiketlerinde `defer` (sayfalarda satır içi script yok); `target="_blank"` bağlantılarında `rel="noopener"`. Google Maps API yalnızca iletişim sayfalarında yüklenir. Silinenler: renk seçici (demo), particles, Lisa Yazılım ikonu/bağlantısı.
- **Sosyal ikonlar kaldırıldı** (hesap yok). Hesap açılırsa gerçek URL ile geri eklenir ve `sameAs`'e girer.
- **Footer metni:** TR `2026 - Telif hakları saklıdır.`, EN `2026 - All rights reserved.`, DE `2026 - Alle Rechte vorbehalten.`
- **Telefon kutusu:** başlık TR/DE "Telefon & Whatsapp", EN "Phone & WhatsApp". Altında `Tel:` satırı ve `wa.me` bağlantısı. İletişim sayfası formu tek sütun ve ortalı (yan bilgi kutusu kaldırıldı).

## 5. Çalışma kuralları
- Türkçe yanıt ver; kısa, net, madde madde.
- Değişiklikten sonra doğrula: kırık iç bağlantı yok, tek H1, her img'de alt, JSON-LD geçerli, başlıklar/açıklamalar benzersiz, `Marmara Ofis Etiket Etiket` gibi çift ek yok.
- Tarayıcı/önizleme sunucusu bu ortamda izin verilmeyebilir; görsel kontrol yapılamadıysa bunu açıkça söyle, "tamam" deme.
- Kullanıcı açıkça istemeden push/deploy yapma, istemediği içerik ekleme (ör. sayfada görünmesini istemediği kişi adı).
- Toplu dönüştürme betikleri geçici bir dizinde yazılır, repoya eklenmez.

## 6. Yapılanlar (özet kronoloji)
1. SEO denetimi: title/description, canonical, hreflang, OG/Twitter, JSON-LD, `robots.txt`, `sitemap.xml` (216 URL), 404 sayfası, 301 yönlendirmeler, tek H1, alt metinleri; yinelenen sayfalar silindi (`tr.html`, `en/en.html`, `about-us.html` vb.).
2. Footer güncellendi, Lisa Yazılım bağlantısı/ikonu kaldırıldı; performans düzeltmeleri (görsel boyutları, lazy, defer, demo/particles kaldırma, `rel=noopener`).
3. Telefon `+90 536 507 26 11` yapıldı (tıklanabilir), faks kaldırıldı, modül başlığı "Telefon & Whatsapp", WhatsApp (`wa.me`) bağlantısı eklendi, alt üç iletişim kutusu eşit yükseklikte, iletişim formu ortalandı.
4. Kariyer sayfalarında CV adresi `info@marmaraofisetiket.net` ve tıklanabilir `mailto`.
5. Kategori giriş metinleri, `ItemList`, ürün `offers`, EN sayfalardaki Türkçe düzeltmeleri, `lastmod` kaldırma, güvenlik başlıkları.
6. "Marmara Ofis" → "Marmara Ofis Etiket" (başlıklar, açıklamalar, şemalar, PHP); ana sayfa metin bölümü; 23 sayfa için elle meta açıklama; `LocalBusiness` `geo`/`hasMap`/`contactPoint`; boş sosyal ikonlar kaldırıldı.
7. JSON-LD'ye Bülent Seven (`employee` + `contactPoint.name`, görünmez).

## 7. Yapılacaklar / açık maddeler
**Kullanıcının hesaplarıyla (kod dışı)**
- Google Search Console (domain mülkü, sitemap gönderimi, ana sayfa + kategoriler için dizine ekleme isteği); Bing Webmaster ve Yandex Webmaster.
- Google Business Profile aç/doldur; dış sitelerde eski telefon `(0212) 548 73 96` kaldıysa güncelle; Google yorumu topla.
- GA4 (veya benzeri) + telefon/WhatsApp/e-posta tıklama olayları.
- Google Maps API anahtarını (iletişim sayfalarında açık) HTTP referrer ile kısıt.

**İçerik (kullanıcıdan bilgi gerekir)**
- 180 ürün sayfasına 80–150 kelimelik açıklama, kullanım alanı, 3–4 soruluk SSS (+ `FAQPage` şeması). Mevcut ürün açıklamaları teknik özellik satırından türetilmiş ve zayıf.
- Rehber/blog bölümü (termal transfer vs direkt termal, ribon seçimi, yazıcı seçimi…); yazar bilgisi ancak kullanıcı isterse.
- Yerel odak sayfaları (İstanbul, Küçükçekmece, Halkalı) – benzersiz içerikle.
- Almanca bölüm: çevir ya da sadeleştir; EN sayfalardaki kalan Türkçe ürün adları/slug'lar.

**Kod (isteyince)**
- `LocalBusiness` için `openingHoursSpecification` ve `sameAs` (saatler ve profil adresleri gelince).
- Başlıklar: 9 başlık 65 karakteri aşıyor (en uzunu 73), gerekirse kısalt.
- Görsel dosya adlarını anahtar kelimeli yap, WebP değerlendirmesi.
- Kullanılmayan kütüphaneleri (jQuery UI, timepicker, bootstrap-select vb.) tarayıcıda test ederek temizle.
- Sitemap'i otomatik üreten küçük bir betik (yeni sayfa eklemeyi kolaylaştırır).
