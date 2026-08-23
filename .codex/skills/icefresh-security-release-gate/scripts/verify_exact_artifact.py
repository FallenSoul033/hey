#!/usr/bin/env python3
"""Verify immutable release-candidate identity before extraction.

This script is intentionally read-only. It checks basename, byte size, and SHA-256
and exits non-zero on any mismatch.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify exact IceFresh release artifact identity before extraction."
    )
    parser.add_argument("artifact", type=Path, help="Path to the candidate ZIP")
    parser.add_argument("--filename", required=True, help="Expected basename")
    parser.add_argument("--size", required=True, type=int, help="Expected byte size")
    parser.add_argument("--sha256", required=True, help="Expected SHA-256 hex digest")
    args = parser.parse_args()

    artifact = args.artifact
    expected_hash = args.sha256.strip().lower()

    if not artifact.is_file():
        print(f"FAIL: artifact not found: {artifact}")
        return 2

    actual_name = artifact.name
    actual_size = artifact.stat().st_size
    actual_hash = sha256_file(artifact)

    print(f"filename={actual_name}")
    print(f"byte_size={actual_size}")
    print(f"sha256={actual_hash}")

    failures: list[str] = []
    if actual_name != args.filename:
        failures.append(f"filename expected {args.filename!r}")
    if actual_size != args.size:
        failures.append(f"byte size expected {args.size}")
    if actual_hash != expected_hash:
        failures.append(f"SHA-256 expected {expected_hash}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1

    print("EXACT ARTIFACT IDENTITY: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
