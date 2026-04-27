"""Download the four ONNX models used by Stickut at Docker build time.

Run as a Dockerfile RUN step so models are baked into the image and the
runtime never reaches out to the network (constitutional principle IX).
"""

from __future__ import annotations

import os
import sys

MODELS = ["birefnet-general", "isnet-general-use", "u2net", "isnet-anime"]


def main() -> int:
    target = os.environ.get("U2NET_HOME", "/models")
    os.makedirs(target, exist_ok=True)
    print(f"[download-models] target dir: {target}")

    # rembg lazily downloads ONNX files on first session creation.
    from rembg import new_session

    for name in MODELS:
        print(f"[download-models] fetching {name}…", flush=True)
        try:
            new_session(name)
        except Exception as exc:
            print(f"[download-models] FAILED for {name}: {exc}", file=sys.stderr)
            return 1
        print(f"[download-models] {name} ok", flush=True)

    print("[download-models] all models ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
