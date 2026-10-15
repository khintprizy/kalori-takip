# Kalori Takip

Tek sayfalik, framework'suz, tamamen cevrimdisi PWA.
Giris yok, sunucu yok: tum veriler sadece telefonun kendi hafizasinda (localStorage) durur.

```
index.html            arayuz + stil
app.js                uygulama mantigi
sw.js                 cevrimdisi calisma (service worker)
manifest.webmanifest  "ana ekrana ekle" bilgileri
icons/                uygulama ikonlari
```

## Yayinlama (GitHub Pages)

Site: https://khintprizy.github.io/kalori-takip/

Guncellemek icin: GitHub'da repo > **Add file > Upload files** > degisen dosyalari surukle > **Commit changes**.
1-2 dakika sonra uygulamayi telefonda kapatip ac. Yeni surum arka planda iner,
**bir sonraki acilista** gorunur (yani 2 kez kapat-ac).

## Yedek (onemli)

Veriler sadece bu telefonda. Telefon degisirse, uygulama silinirse veya
tarayici verileri temizlenirse kaybolur. Bu yuzden ara ara:

**Ayarlar > Yedek > Disa aktar (JSON)** ile yedek al ve dosyayi Drive / e-posta gibi
bir yere koy. Yeni cihazda **Ice aktar** ile geri yuklenir.

**Ayarlar > Gunluk makrolar** ise sadece okumak icindir: her gunun toplam kalori,
protein, karbonhidrat, yag degerleri ve aylik ortalamalar. Ice aktarilamaz.

## Telefonda ana ekrana ekleme

- iPhone (Safari): Paylas > **Ana Ekrana Ekle**.
- Android (Chrome): sag ust (uc nokta) > **Ana ekrana ekle** / **Uygulamayi yukle**.

Not: Veriler, uygulamayi hangi yerden actiysan oraya kaydedilir. iPhone'da ana ekran
uygulamasi ile Safari'deki sayfa ayri hafiza kullanir; hep ana ekrandan ac.

## Eski surum

Supabase + girisli eski surum Masaustunde `kalori-takip-eski-supabase` klasorunde duruyor.
