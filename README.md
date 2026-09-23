# Kalori Takip - Kurulum

Tek sayfalik, framework'suz PWA. Veriler Supabase'de, cevrimdisi da calisir.

```
index.html            arayuz + stil
app.js                uygulama mantigi
config.js             Supabase adresi ve anahtari (sen dolduracaksin)
sw.js                 cevrimdisi calisma (service worker)
manifest.webmanifest  "ana ekrana ekle" bilgileri
icons/                uygulama ikonlari
supabase.sql          tablolar + RLS politikalari
```

---

## 1. Supabase projesi, tablolar ve RLS

1. https://supabase.com adresinde ucretsiz hesap ac > **New project**.
   Ad ver (orn. `kalori`), veritabani sifresi belirle (bir yere not et, uygulamada kullanilmiyor), bolge olarak **Frankfurt (eu-central-1)** sec > **Create**. 1-2 dakika bekle.
2. Sol menu **SQL Editor** > **New query** > `supabase.sql` dosyasinin tamamini yapistir > **Run**.
   "Success. No rows returned" gormelisin. Bu adim 5 tabloyu olusturur ve Row Level Security'yi acar: her satir yalnizca sahibine gorunur, giris yapmamis kimse hicbir sey okuyamaz.
3. **Kendi kullanicini olustur** (e-posta + sifre ile giris icin):
   **Authentication > Users > Add user > Create new user** > e-postani ve bir sifre yaz >
   **Auto Confirm User** kutusu isaretli olsun > **Create user**.
   (E-posta sablonlarina dokunma; onlari duzenlemek icin ayrica e-posta sunucusu gerekiyor, bu uygulamada gerek yok.)
4. **Yonlendirme adresi**: GitHub Pages adresini ogrendikten sonra (3. adim) buraya donup
   **Authentication > URL Configuration** bolumunde:
   - **Site URL**: `https://KULLANICI-ADIN.github.io/kalori-takip/`
   - **Redirect URLs** > Add URL: ayni adres.
   (Bu adres sadece "sifresiz e-posta baglantisi" ile giris icin gerekli. Hep sifreyle girersen atlanabilir, ama eklemek zararsiz.)
5. **Baskasi kayit olamasin**: Kullanicini 3. adimda olusturduktan sonra
   **Authentication > Sign In / Providers > Email** (veya "User Signups") altinda **Allow new users to sign up** secenegini kapat. RLS zaten verini baskalarindan korur; bu sadece yabanci hesap acilmasini engeller.

> Notlar
> - Sifresiz e-posta baglantisi da istersen kullanilabilir, ama Supabase'in dahili e-posta servisi saatte birkac e-postayla sinirli. Sifreyle giris bu sinirdan etkilenmez.
> - Ucretsiz projeler 7 gun hic kullanilmazsa duraklatilir. Her gun kullanacagin icin sorun olmaz; olursa panelden "Restore" demen yeterli, veriler kaybolmaz.

## 2. Anahtarlari koda yazma

Supabase panelinde **Project Settings > API Keys** (veya ustteki **Connect** butonu):

- **Project URL** > `https://xxxxxxxx.supabase.co`
- **Publishable key** (`sb_publishable_...`) - eski projelerde adi **anon public** key.

`config.js` dosyasini ac ve iki degeri yaz:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
};
```

Bu anahtar herkese acik olacak sekilde tasarlandi; guvenligi RLS sagliyor. **`secret` / `service_role` anahtarini asla buraya yazma.**

## 3. GitHub Pages'e yayinlama

1. https://github.com > **New repository** > ad: `kalori-takip` > **Public** > **Create repository**.
   (Ucretsiz hesapta Pages yalnizca public depolarda calisir. Kodda gizli bir sey yok, veriler Supabase'de ve RLS ile korunuyor.)
2. Depo sayfasinda **uploading an existing file** baglantisina tikla > bu klasordeki **tum dosyalari ve `icons` klasorunu** surukle birak > **Commit changes**.
   `index.html` deponun kok dizininde olmali (bir alt klasorde degil).
3. **Settings > Pages** > *Build and deployment* altinda **Source: Deploy from a branch**, **Branch: main**, klasor **/ (root)** > **Save**.
4. 1-2 dakika sonra sayfanin ustunde adres gorunur: `https://KULLANICI-ADIN.github.io/kalori-takip/`
5. Bu adresi Supabase'de **Site URL** ve **Redirect URLs** olarak ekle (1. bolum, 4. adim).
6. Adresi bilgisayarda ac > e-postani ve sifreni yaz > **Giris yap**.
   Ilk giriste baslangic yiyecek listesi ve hedefler otomatik yuklenir.

**Guncelleme**: Bir dosyayi degistirmek istersen GitHub'da dosyayi acip kalem simgesiyle duzenle veya ayni adla tekrar yukle. Uygulama bir sonraki acilista yeni surumu alir.

## 4. Telefonda ana ekrana ekleme

**iPhone (Safari)**
1. Adresi **Safari**'de ac (Chrome degil).
2. Alt ortadaki **Paylas** simgesi (kutudan cikan ok) > **Ana Ekrana Ekle** > **Ekle**.
3. Ana ekrandaki **Kalori** simgesinden ac > e-postani ve sifreni yaz > **Giris yap**.
   iPhone'da e-posta baglantisini kullanma: baglanti Safari'de acilir ve oturum ana ekran uygulamasina gecmez.

**Android (Chrome)**
1. Adresi Chrome'da ac.
2. Sag ustteki **(uc nokta)** menu > **Ana ekrana ekle** veya **Uygulamayi yukle** > **Yukle**.
3. Uygulamayi ac ve e-posta + sifre ile giris yap.

Giris bir kez yapilir; oturum hatirlanir.

---

## Kullanim notlari

- **Cevrimdisi**: Internet yokken de yiyecek ekleyebilir, silebilir, duzenleyebilirsin. Ustte "Cevrimdisi - N degisiklik bekliyor" yazar; baglanti gelince (veya uygulamayi tekrar acinca) otomatik gonderilir. Ayni anda iki cihazda ayni kaydi duzenlersen son gonderilen gecerli olur.
- **Duzenleme**: "Yiyecekler" basliginin yanindaki **Duzenle**'ye bas; bir yiyecege veya ogune dokununca duzenleme/silme ekrani acilir.
- **Gramla ekleme**: Yiyecegin "1 porsiyon kac gram" alani doluysa porsiyon ekraninda gram girebilirsin; bossa porsiyon sayisi girersin. Baslangic listesinde grami bilinenler (peynir, yogurt, sut, nohut, ceviz, tavuk) dolu geldi.
- **Gecmis**: Gecmis sekmesinde bir gune dokunursan o gun acilir; unuttugun bir seyi sonradan ekleyebilirsin. "Hedefi tuttu" degerlendirmesi o gunun spor/dinlenme tipine ve guncel hedeflerine gore yapilir.
- **Yedek**: Ayarlar > **Disa aktar** tum veriyi JSON indirir. **Ice aktar** mevcut verilerle birlestirir, bir sey silmez.

Supabase
database password ut3f0REOytXWyLVd