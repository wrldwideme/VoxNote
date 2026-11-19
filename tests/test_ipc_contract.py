from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path
from typing import Any, cast

from voxnote.sidecar.service import SidecarService

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "resources" / "ipc_contract.json"
SERVICE_PATH = ROOT / "src" / "voxnote" / "sidecar" / "service.py"


def _load_contract() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(CONTRACT_PATH.read_text(encoding="utf-8")))


def test_ipc_contract_methods_match_sidecar_signatures() -> None:
    contract = _load_contract()

    for method_name, definition in contract["methods"].items():
        handler = getattr(SidecarService, method_name, None)
        assert callable(handler), f"IPC method '{method_name}' is missing in SidecarService"

        signature = inspect.signature(handler)
        parameters = {
            name: parameter for name, parameter in signature.parameters.items() if name != "self"
        }
        accepts_kwargs = any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD for parameter in parameters.values()
        )
        declared = set(definition["required"]) | set(definition["optional"])

        if not accepts_kwargs:
            missing_in_python = declared - parameters.keys()
            assert not missing_in_python, (
                f"IPC method '{method_name}' declares params absent from Python: "
                f"{sorted(missing_in_python)}"
            )

        required_by_python = {
            name
            for name, parameter in parameters.items()
            if parameter.default is inspect.Parameter.empty
            and parameter.kind
            in {inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY}
        }
        missing_in_contract = required_by_python - declared
        assert not missing_in_contract, (
            f"Python method '{method_name}' requires undeclared params: "
            f"{sorted(missing_in_contract)}"
        )


def test_ipc_contract_lists_every_sidecar_event() -> None:
    tree = ast.parse(SERVICE_PATH.read_text(encoding="utf-8"))
    emitted: set[str] = set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "_emit" or not node.args:
            continue
        event_name = node.args[0]
        if isinstance(event_name, ast.Constant) and isinstance(event_name.value, str):
            emitted.add(event_name.value)

    declared = set(_load_contract()["events"])
    assert emitted == declared, (
        f"IPC event contract drift: missing={sorted(emitted - declared)}, "
        f"unused={sorted(declared - emitted)}"
    )
