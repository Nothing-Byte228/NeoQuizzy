# NeoQuizzy

Базовый каркас приложения на Electron + VanillaJS с безопасным `preload`.

## Установка

```bash
npm install
```

## Запуск

```bash
npm start
```

## Что уже есть

- окно Electron
- `main.js` для основного процесса
- безопасный `preload.js` через `contextBridge`
- `renderer.js` для интерфейса
- минимальный UI на HTML/CSS

## Расширение

Добавляйте новые модули в `src/`, подключайте API через `window.electronAPI` и используйте IPC между renderer и main процессом.
