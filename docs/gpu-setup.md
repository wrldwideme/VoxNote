# NVIDIA GPU в VoxNote

VoxNote использует GPU через faster-whisper и CTranslate2. Драйвера NVIDIA и
вывода `nvidia-smi` недостаточно: для актуальной ветки faster-whisper нужны
библиотеки cuBLAS и cuDNN для CUDA 12.

## Режимы приложения

- **Авто** — выполняет короткий CUDA warm-up. При ошибке до начала распознавания
  освобождает GPU-сервис и использует CPU.
- **Видеокарта** — требует исправный CUDA runtime и не переходит на CPU молча.
- **Процессор** — использует CTranslate2 `int8` и не требует CUDA.

Если GPU перестала отвечать или закончилась VRAM уже во время транскрибации,
VoxNote останавливает задание. Автоматический повтор многочасовой записи на CPU
не выполняется.

## Рекомендуемая установка Windows

Из активированного окружения проекта выполните:

```powershell
python -m pip install -e ".[dev,gpu]"
```

Опциональная группа `gpu` устанавливает закреплённые официальные NVIDIA wheels:

- `nvidia-cublas-cu12==12.9.2.10`;
- `nvidia-cudnn-cu12==9.28.1.4`;
- зависимый NVRTC для CUDA 12.

Общий объём загрузки составляет около 1,3 ГБ. VoxNote на старте находит каталоги
`nvidia/*/bin` внутри окружения и регистрирует их только для текущего процесса.
Системный `PATH` не изменяется.

Для текущих `faster-whisper` и CTranslate2 также необходимы:

1. совместимая NVIDIA GPU и актуальный драйвер;
2. доступные `cublas64_12.dll` и `cudnn64_9.dll` из группы `gpu` либо официальной
   системной установки CUDA 12/cuDNN 9;
3. перезапуск уже открытого VoxNote после установки пакетов.

Актуальные первичные источники:

- [GPU requirements faster-whisper](https://github.com/SYSTRAN/faster-whisper#gpu);
- [CTranslate2 installation](https://opennmt.net/CTranslate2/installation.html);
- [CUDA downloads](https://developer.nvidia.com/cuda-downloads);
- [cuDNN downloads](https://developer.nvidia.com/cudnn-downloads).

Не копируйте DLL из случайных архивов. NVIDIA runtime не включается в Git-репозиторий:
он устанавливается как опциональная зависимость из официальных wheels.

## Проверенное состояние тестового компьютера

18 ноября 2026 года VoxNote обнаружил RTX 4060 с 8 ГБ VRAM и доступные режимы
CTranslate2 `float16`/`int8`. До установки runtime CUDA warm-up корректно
переключил `Auto` на CPU. После установки официальных wheels одна локальная
запись длительностью 1:42 была полностью обработана моделью `small`:

- CPU `int8`: 28,63 секунды;
- RTX 4060 `float16`: 6,57 секунды.

На этом компьютере GPU оказался примерно в 4,4 раза быстрее. Результат зависит
от модели, записи и оборудования и не является гарантией для других систем.
