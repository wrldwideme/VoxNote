# Релизный процесс VoxNote

Публичный релиз приложения содержит один пользовательский дистрибутив — лёгкий NSIS-установщик. Файлы `.sig` и `latest.json` являются служебными метаданными безопасного автообновления и не предлагаются пользователю как варианты установки.

## Обычный релиз приложения

1. Обновить версию в `package.json`, `pyproject.toml`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/voxnote/__init__.py` и тестах версии.
2. Добавить `docs/releases/vX.Y.Z.md` и обновить `CHANGELOG.md`.
3. Запустить полный набор проверок.
4. Создать и отправить тег `vX.Y.Z`.
5. Workflow `Release slim app` собирает Windows-приложение, подписывает updater и публикует только:
   - `VoxNote_X.Y.Z_x64-slim-setup.exe`;
   - `VoxNote_X.Y.Z_x64-slim-setup.exe.sig`;
   - `latest.json`.

В репозитории должен быть настроен GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` добавляется только для ключа с паролем. Приватный ключ нельзя хранить в Git.

Локальная проверочная сборка выполняется командой:

```powershell
./scripts/package_windows.ps1
```

## Релиз ML-runtime

Runtime версионируется независимо и публикуется только при изменениях Python-sidecar, faster-whisper/CTranslate2/PyAV или набора CUDA DLL:

```powershell
./scripts/package_runtime.ps1 -RuntimeVersion X.Y.Z
```

Технический GitHub Release `runtime-vX.Y.Z` получает core-архив, NVIDIA-архив и `runtime-manifest.json`. После публикации нужно проверить SHA-256, размеры и доступность обоих URL из `resources/runtime_manifest.json`.

Изменение только React/Tauri-интерфейса не требует пересборки или повторной загрузки runtime. Модели Whisper никогда не входят ни в один установщик и скачиваются приложением только после явного выбора пользователя.
