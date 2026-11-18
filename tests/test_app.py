import voxnote
from voxnote.__main__ import main


def test_package_has_development_version() -> None:
    assert voxnote.__version__ == "0.1.0.dev0"


def test_main_entrypoint_is_callable() -> None:
    assert callable(main)
