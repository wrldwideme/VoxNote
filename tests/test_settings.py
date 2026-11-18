from voxnote.services.settings import AppSettings, SettingsStore


def test_settings_round_trip(tmp_path) -> None:  # type: ignore[no-untyped-def]
    store = SettingsStore(tmp_path / "settings.json")
    expected = AppSettings(
        theme="dark",
        reduce_motion=True,
        selected_model="small",
        selected_dictionary="medical-ru",
        device_preference="cpu",
    )

    store.save(expected)

    assert store.load() == expected


def test_corrupt_settings_fall_back_to_safe_defaults(tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "settings.json"
    path.write_text("not valid json", encoding="utf-8")

    assert SettingsStore(path).load() == AppSettings()


def test_unknown_values_are_sanitized(tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "settings.json"
    path.write_text(
        '{"theme":"neon","device_preference":"cloud","selected_model":42}',
        encoding="utf-8",
    )

    assert SettingsStore(path).load() == AppSettings()
