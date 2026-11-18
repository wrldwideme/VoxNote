from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# Standard JSON-RPC 2.0 error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

# Application-specific error codes (-32000 to -32099)
BUSY_ERROR = -32000
DEVICE_ERROR = -32001
FILE_ERROR = -32002
MODEL_ERROR = -32003
DICTIONARY_ERROR = -32004


@dataclass(frozen=True, slots=True)
class JsonRpcRequest:
    method: str
    id: int | str
    params: dict[str, Any] = field(default_factory=dict)
    jsonrpc: str = "2.0"


@dataclass(frozen=True, slots=True)
class JsonRpcError:
    code: int
    message: str
    data: Any = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.data is not None:
            result["data"] = self.data
        return result


@dataclass(frozen=True, slots=True)
class JsonRpcResponse:
    id: int | str
    result: Any
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "jsonrpc": self.jsonrpc,
            "id": self.id,
            "result": self.result,
        }


@dataclass(frozen=True, slots=True)
class JsonRpcErrorResponse:
    id: int | str | None
    error: JsonRpcError
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "jsonrpc": self.jsonrpc,
            "id": self.id,
            "error": self.error.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class JsonRpcNotification:
    method: str
    params: dict[str, Any] = field(default_factory=dict)
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "jsonrpc": self.jsonrpc,
            "method": self.method,
            "params": self.params,
        }


def parse_message(raw_line: str) -> JsonRpcRequest:
    """Parse an incoming line-delimited JSON-RPC 2.0 request.

    Raises:
        ValueError: if payload is not valid JSON, not an object, or lacks required fields.
    """
    cleaned = raw_line.strip()
    if not cleaned:
        raise ValueError("Empty request line")

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as err:
        raise ValueError(f"JSON parse error: {err}") from err

    if not isinstance(data, dict):
        raise ValueError("JSON-RPC message must be an object")

    if data.get("jsonrpc") != "2.0":
        raise ValueError("Only JSON-RPC 2.0 is supported")

    method = data.get("method")
    if not isinstance(method, str) or not method:
        raise ValueError("Request must contain a non-empty string method")

    req_id = data.get("id")
    if req_id is None:
        raise ValueError("Request must contain an id")
    if not isinstance(req_id, (int, str)):
        raise ValueError("Request id must be an integer or string")

    params = data.get("params", {})
    if params is None:
        params = {}
    elif not isinstance(params, dict):
        raise ValueError("Params must be an object/dict if provided")

    return JsonRpcRequest(
        method=method,
        id=req_id,
        params=params,
    )


def format_response(req_id: int | str, result: Any) -> str:
    """Format a successful JSON-RPC 2.0 response line."""
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "result": result,
    }
    return json.dumps(payload, ensure_ascii=False)


def format_error(
    req_id: int | str | None,
    code: int,
    message: str,
    data: Any = None,
) -> str:
    """Format an error JSON-RPC 2.0 response line."""
    error_obj: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error_obj["data"] = data
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": error_obj,
    }
    return json.dumps(payload, ensure_ascii=False)


def format_notification(method: str, params: dict[str, Any]) -> str:
    """Format an outgoing JSON-RPC 2.0 streaming notification line."""
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    }
    return json.dumps(payload, ensure_ascii=False)
