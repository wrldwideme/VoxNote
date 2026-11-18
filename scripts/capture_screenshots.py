# ruff: noqa: RUF001
import sys
from pathlib import Path

from PySide6.QtCore import QUrl
from PySide6.QtGui import QGuiApplication
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtQuick import QQuickWindow  # noqa: F401
from PySide6.QtQuickControls2 import QQuickStyle
from PySide6.QtTest import QTest

# Add src to path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).parents[1]))

from tests.test_bridge import FakeModelClient, FakeService
from voxnote.ui.bridge import AppBridge

from voxnote.application.controller import ApplicationController
from voxnote.services.diagnostics import TechnicalDiagnostics
from voxnote.services.history import LocalHistoryStore
from voxnote.services.model_manager import MODEL_CATALOG, LocalModelManager
from voxnote.services.settings import SettingsStore


def run() -> None:
    QQuickStyle.setStyle("Basic")
    app = QGuiApplication.instance() or QGuiApplication(sys.argv)

    output_dir = Path(__file__).parents[1] / "output_screenshots"
    output_dir.mkdir(exist_ok=True)

    tmp_dir = Path(__file__).parents[1] / ".tmp_screenshots"
    tmp_dir.mkdir(exist_ok=True)

    history_store = LocalHistoryStore(tmp_dir / "history.json")
    history_store.clear()

    e1 = history_store.add_entry(
        file_name="Фармакология_лекция_04.mp3",
        duration_seconds=2520.0,
        model_id="small",
        device="CPU",
        dictionary_id="builtin_medical",
        text="Пациенту назначен курс антибактериальной терапии.",
        title="Фармакология: Антибиотики и фармакодинамика",
    )
    history_store.update_entry_text(
        e1.id,
        "Пациенту назначен курс антибактериальной терапии.\n\n"
        "Ключевые аспекты фармакодинамики:\n"
        "1. Высокая биодоступность при пероральном приёме (более 85%).\n"
        "2. Стабильная терапевтическая концентрация достигается через 2 часа.",
    )

    history_store.add_entry(
        file_name="Анатомия_сердечно_сосудистая.wav",
        duration_seconds=3120.0,
        model_id="turbo",
        device="CUDA",
        dictionary_id="builtin_medical",
        text="Анатомия проводящей системы сердца.",
        title="Анатомия: Сердечно-сосудистая система",
    )

    history_store.add_entry(
        file_name="Клинический_разбор_кардиология.m4a",
        duration_seconds=1840.0,
        model_id="large-v3",
        device="CPU",
        dictionary_id=None,
        text="Разбор пациента 58 лет с жалобами на одышку.",
        title="Клинический случай: ИБС и аритмия",
    )

    qml_path = Path(__file__).parents[1] / "src" / "voxnote" / "ui" / "qml" / "Main.qml"

    def capture(
        name: str,
        width: int,
        height: int,
        theme: str,
        view_mode: str,
        has_file: bool = False,
        open_model_dialog: bool = False,
        open_dictionary_dialog: bool = False,
        long_document: bool = False,
        show_diagnostics_toast: bool = False,
    ) -> None:
        models_dir = tmp_dir / "models"
        models_dir.mkdir(exist_ok=True)
        (models_dir / "small").mkdir(exist_ok=True)
        (models_dir / "small" / "model.bin").write_bytes(b"data")
        (models_dir / "large-v3").mkdir(exist_ok=True)
        (models_dir / "large-v3" / "model.bin").write_bytes(b"data")

        manager = LocalModelManager(models_dir, catalog=MODEL_CATALOG, client=FakeModelClient({}))
        settings_file = tmp_dir / "settings.json"
        settings_store = SettingsStore(settings_file)
        controller = ApplicationController(settings_store)
        controller.update_settings(selected_model="large-v3")

        bridge = AppBridge(
            controller=controller,
            model_manager=manager,
            model_path=models_dir / "large-v3",
            service_factory=lambda _path, _device: FakeService(),
            history_store=history_store,
            diagnostics=TechnicalDiagnostics(tmp_dir / "logs" / "voxnote.jsonl"),
        )
        bridge.setThemeMode(theme)

        if has_file:
            sample_audio = tmp_dir / "лекция_фармакология.mp3"
            sample_audio.write_bytes(b"dummy_mp3_data")
            bridge.selectFile(QUrl.fromLocalFile(str(sample_audio)))

        if view_mode == "editor":
            entries = history_store.get_entries()
            if entries:
                bridge.openLibraryEntry(entries[0].id)
                if long_document:
                    bridge.onActiveContentEdited(
                        "Длинное название лекции: клиническая фармакология "
                        "сердечно-сосудистой системы",
                        "\n\n".join(
                            [
                                "Раздел клинической лекции с подробным объяснением "
                                "механизма действия препаратов, показаний, противопоказаний "
                                "и особенностей наблюдения за пациентом."
                            ]
                            * 18
                        ),
                    )
        else:
            bridge.openNewTranscription()

        engine = QQmlApplicationEngine()
        engine.warnings.connect(
            lambda warnings: print("\n".join(warning.toString() for warning in warnings))
        )
        engine.setInitialProperties({"appBridge": bridge})
        engine.load(QUrl.fromLocalFile(str(qml_path)))
        app.processEvents()

        roots = engine.rootObjects()
        if not roots:
            raise RuntimeError(f"QML failed to load: {qml_path}")
        win = roots[0]
        win.setWidth(width)
        win.setHeight(height)
        win.show()
        app.processEvents()

        if open_model_dialog:
            win.openModelManager()
            app.processEvents()

        if open_dictionary_dialog:
            win.openDictionaryManager()
            app.processEvents()

        if show_diagnostics_toast:
            bridge.copyDiagnostics()
            app.processEvents()
            QTest.qWait(200)

        app.processEvents()

        img = win.grabWindow()
        out_file = output_dir / f"{name}.png"
        img.save(str(out_file))
        print(f"Saved {out_file.name} ({width}x{height})")

        engine.deleteLater()
        bridge.shutdown()
        app.processEvents()

    capture("screenshot_library_light", 1280, 800, "light", "editor")
    capture("screenshot_library_dark", 1280, 800, "dark", "editor")
    capture("screenshot_new_empty", 1280, 800, "light", "new", has_file=False)
    capture("screenshot_new_with_file", 1280, 800, "light", "new", has_file=True)
    capture("screenshot_model_dialog", 1280, 800, "light", "new", open_model_dialog=True)
    capture(
        "screenshot_dictionary_dialog",
        1280,
        800,
        "light",
        "new",
        open_dictionary_dialog=True,
    )
    capture("screenshot_window_1024", 1024, 768, "light", "editor")
    capture(
        "screenshot_long_document",
        1280,
        800,
        "light",
        "editor",
        long_document=True,
    )
    capture(
        "screenshot_diagnostics_toast",
        1280,
        800,
        "light",
        "editor",
        show_diagnostics_toast=True,
    )


if __name__ == "__main__":
    run()
