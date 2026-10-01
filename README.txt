Борт — самолёты в небе (PWA)

Файлы: index.html, manifest.json, sw.js, папка icons. Выкладывать всё вместе, структуру не менять.

GitHub Pages:
1. Создайте публичный репозиторий на github.com (например, bort).
2. Add file → Upload files → перетащите все файлы и папку icons → Commit.
3. Settings → Pages → Branch: main, папка / (root) → Save.
4. Через 1–2 минуты сайт будет по адресу https://ВАШ_ЛОГИН.github.io/bort/

Установка на телефон:
- Android (Chrome): кнопка «Установить» на карте или меню ⋮ → «Добавить на главный экран».
- iPhone (Safari): «Поделиться» → «На экран „Домой“».

Источники данных: adsb.lol → airplanes.live → OpenSky Network (если первый не отвечает, берётся следующий).
Маршруты: adsbdb.com. Фото: planespotters.net. Карта: OpenStreetMap и CARTO.

После изменения файлов поменяйте VERSION в sw.js (bort-v1 → bort-v2), чтобы телефоны получили обновление.
