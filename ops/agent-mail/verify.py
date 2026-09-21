#!/usr/bin/env python3
"""Exercise the local MCP service without sending mail or editing project files."""
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from uuid import uuid4

ENDPOINT = "http://127.0.0.1:8765/mcp/"


class Client:
    def __init__(self):
        self.sequence = 0
        self.headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }

    def request(self, method, params, notification=False):
        self.sequence += 1
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        if not notification:
            payload["id"] = self.sequence
        request = Request(ENDPOINT, json.dumps(payload).encode(), self.headers)
        with urlopen(request, timeout=30) as response:
            if session := response.headers.get("Mcp-Session-Id"):
                self.headers["Mcp-Session-Id"] = session
            raw = response.read().decode()
        if notification:
            return None
        if raw.startswith("event:") or raw.startswith("data:"):
            raw = next(line[5:].strip() for line in raw.splitlines()
                       if line.startswith("data:"))
        result = json.loads(raw)
        if result.get("id") != self.sequence or "error" in result:
            raise RuntimeError(f"{method}: {result}")
        return result["result"]

    def call(self, name, **arguments):
        result = self.request("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError"):
            raise RuntimeError(f"{name}: {result}")
        if "structuredContent" in result:
            return result["structuredContent"]
        return json.loads(next(item["text"] for item in result["content"]
                               if item["type"] == "text"))


def main():
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_absolute():
        raise SystemExit("Usage: verify.py /absolute/path/to/primary/clone")
    project_key = str(Path(sys.argv[1]).resolve(strict=True))
    client = Client()
    init = client.request("initialize", {
        "protocolVersion": "2024-11-05", "capabilities": {},
        "clientInfo": {"name": "orchard-agent-mail-verification", "version": "1"},
    })
    client.headers["MCP-Protocol-Version"] = init["protocolVersion"]
    client.request("notifications/initialized", {}, notification=True)
    names = set()
    cursor = None
    while True:
        page = client.request("tools/list", {"cursor": cursor} if cursor else {})
        names.update(tool["name"] for tool in page["tools"])
        cursor = page.get("nextCursor")
        if not cursor:
            break
    required = {"health_check", "ensure_project", "register_agent", "fetch_inbox",
                "file_reservation_paths", "release_file_reservations"}
    if missing := required - names:
        raise RuntimeError(f"Missing tools: {missing}")
    client.call("health_check")
    project = client.call("ensure_project", human_key=project_key)
    agent = client.call("register_agent", project_key=project_key,
                        program="orchard-verification", model="protocol-test",
                        task_description="Installation smoke test; no messages sent")
    identity = {"project_key": project_key, "agent_name": agent["name"]}
    client.call("fetch_inbox", **identity, limit=1, include_bodies=False)
    # A unique synthetic path cannot interfere with agents editing actual files.
    path = f".agent-mail-smoke/{uuid4().hex}"
    try:
        reservation = client.call("file_reservation_paths", **identity,
                                  paths=[path], ttl_seconds=60, exclusive=True,
                                  reason="Installation smoke test")
        if reservation["conflicts"] or len(reservation["granted"]) != 1:
            raise RuntimeError(f"Reservation failed: {reservation}")
    finally:
        released = client.call("release_file_reservations", **identity, paths=[path])
    if released["released"] != 1:
        raise RuntimeError(f"Reservation not released: {released}")
    print(f"PASS: {len(names)} tools; project {project['id']}; "
          f"agent {agent['name']}; inbox and reservation/release verified")


if __name__ == "__main__":
    main()
