from pathlib import Path

from voxnote.services.paths import AppPaths


def test_app_paths_use_local_app_data() -> None:
    paths = AppPaths.from_environment({"LOCALAPPDATA": r"C:\Users\Test\AppData\Local"})

    assert paths.root == Path(r"C:\Users\Test\AppData\Local") / "VoxNote"
    assert paths.settings_file == paths.root / "settings.json"
    assert paths.models_dir == paths.root / "models"
