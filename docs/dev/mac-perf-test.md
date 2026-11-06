# MD Editor — Mac'te performans ölçümü (AC-PERF-09)

Bu ölçümle önizlemeyi hızla kaydırırken (fling) hiçbir frame'in 32 ms'yi aşmadığını gerçek bir Mac'te doğrulayacağız. GitHub'ın macOS CI'ı sanal makinede, sanal GPU ile çalıştığı için bu soruyu cevaplayamıyor.

## 1. Gerekenler (bir kez)

Terminal'i aç ve kontrol et:

```bash
git --version     # yoksa: xcode-select --install
node --version    # v24 veya üstü olmalı
```

Node yoksa veya 24'ten eskiyse iki yol var:
- https://nodejs.org adresinden LTS (24) kurulumunu indir, ya da
- `brew install node@24` ve ardından `brew link --overwrite node@24`

## 2. Ölçüm (yaklaşık 10–15 dakika)

1. Açık uygulamaları kapat (özellikle tarayıcı ve video). Mac şarja takılı olsun. Low Power Mode kapalı olsun.
2. Terminal'de şunu çalıştır:

```bash
curl -fsSL https://raw.githubusercontent.com/isumer/md-editor/bug/perf09-diag/scripts/perf-mac.sh | bash
```

3. Bir MD Editor penceresi birkaç kez açılıp kendi kendine kaydıracak. **Bu sırada Mac'i kullanma** ve pencereyi kapatma.
4. En sonda ekranda şuna benzer satırlar görünür:

```
AC-PERF-09 500KB scroll: frames=111 maxFrame=16.8ms frames>32ms=0 ...
AC-PERF-09 20MB scroll: frames=111 maxFrame=16.8ms frames>32ms=0 ...
Bitti: /Users/<sen>/Desktop/md-editor-perf.tgz
```

## 3. Sonucu gönder

- Masaüstündeki **`md-editor-perf.tgz`** dosyasını Jarvis'e ulaştır. İçinde frame süreleri, Chromium trace'leri ve makine bilgisi var; kişisel veri yok.
- Dosyayı gönderemezsen ekrandaki `scroll:` satırlarını kopyalayıp yapıştırman da ilk bakış için yeter.

## Bilgi

- Betik yalnızca `~/md-editor-perf` klasörüne yazar ve sistemde başka bir şey değiştirmez. İşin bitince `rm -rf ~/md-editor-perf` ile silebilirsin.
- Hata verirse terminaldeki son 20 satırı gönder.
- Sonucu Jarvis şöyle okuyacak: M4 Pro/Max'te en uzun frame 10 ms'nin altındaysa M1 Air'de de büyük olasılıkla yeter, takılma CI VM'sine ait demektir. M4'te de 32 ms'yi aşan frame varsa bu gerçek bir ürün hatasıdır ve trace ile kaynağına inilir.
