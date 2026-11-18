# SPS Project v2.8.0 — Arxitektura · ОВ · ВК · ТМ · Smeta · ГОСТ А3

**Santex Profi-Servis Project (`SPS Project`)** — binolarning ichki muhandislik tizimlari (3D LiDAR Skaner, Arxitektura, Teplopoterya, Тёплый пол + Радиаторлар, Вентиляция ПВУ & Фанкойл, ВК, ТМ Котельная, Climate House Smeta va ГОСТ А3 ishchi chizmalar albomi) prototipi.

---

## 💻 2-kompyuterda (uyda yoki boshqa ofisda) ishga tushirish

Kompyuterda **Node.js (v20+)** va **Git** o‘rnatilgan bo‘lishi kifoya:

```powershell
# 1. Loyihani GitHubdan bir marta ko'chirib olish:
git clone https://github.com/shavkatcg-jpg/SPS-AI.git
cd SPS-AI

# 2. Kutubxonalarni o'rnatish:
npm install

# 3. Dasturni ishga tushirish (brauzerda http://localhost:5185 ochiladi):
npm run dev
```

---

## 🔄 2 ta kompyuter o‘rtasida sinxron ishlash tartibi

- **Ishni tugatganda (o‘zgarishlarni GitHubga saqlash):**
  ```powershell
  git add .
  git commit -m "Yangilanish"
  git push
  ```

- **Boshqa kompyuterga o‘tganda (eng oxirgi holatni tortib olish):**
  ```powershell
  git pull
  npm run dev
  ```

---

## 🧪 Avto-testlar va Tekshiruv

```powershell
npm test
npm run build
```
