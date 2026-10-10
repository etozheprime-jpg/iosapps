# Šurmulys — события Вильнюса (PWA)

Приложение собирает концерты, спектакли, выставки, фестивали и прочее в Вильнюсе и показывает сводку «на сегодня».
Three.js-фон, 3D-карточки, офлайн-режим, установка на телефон.

## Как обновляются данные
`.github/workflows/surmulys-events.yml` каждые 6 часов запускает `tools/fetch-events.mjs`,
который читает страницы из `tools/sources.json` (разметка schema.org/Event) и перезаписывает `data/events.json`.
Если данные изменились — workflow коммитит файл, GitHub Pages публикует новую версию.
Приложение подтягивает свежий файл при открытии, при возврате на вкладку и раз в 30 минут.

* Добавить источник — дописать объект в `tools/sources.json` (`url`, `linkPattern`, `maxLinks`).
* Ticketmaster (по желанию): добавить секрет репозитория `TICKETMASTER_KEY` — сборщик подхватит его сам.
* Запустить вручную: Actions → «Šurmulys — обновление событий» → Run workflow.
* Локально: `node surmulys/tools/fetch-events.mjs`.

## Публикация
Settings → Pages → Source: *Deploy from a branch*, ветка `main`, папка `/ (root)`.
Адрес: `https://<логин>.github.io/iosapps/surmulys/`.

## Установка
Android/Chrome — «Установить»; iPhone/Safari — «Поделиться» → «На экран Домой».
После правок файлов приложения меняйте `VERSION` в `sw.js`.
