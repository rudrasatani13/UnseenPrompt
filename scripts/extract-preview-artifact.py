#!/usr/bin/env python3

import sys
import tarfile
from pathlib import Path, PurePosixPath


def validate_member(member: tarfile.TarInfo) -> None:
    path = PurePosixPath(member.name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe preview artifact path: {member.name}")
    if not path.parts or path.parts[0] != ".open-next":
        raise ValueError(
            f"Preview artifact member is outside the .open-next directory: {member.name}"
        )
    if not (member.isfile() or member.isdir()):
        raise ValueError(
            "Preview artifact may contain only regular files and directories: "
            f"{member.name}"
        )


def extract_preview_artifact(archive_path: Path, destination: Path) -> None:
    if not archive_path.is_file():
        raise ValueError("Preview artifact archive is missing")
    if (destination / ".open-next").exists():
        raise ValueError("Preview artifact destination already contains .open-next")

    with tarfile.open(archive_path) as bundle:
        members = bundle.getmembers()
        names: set[str] = set()
        for member in members:
            validate_member(member)
            normalized_name = str(PurePosixPath(member.name))
            if normalized_name in names:
                raise ValueError(
                    f"Preview artifact contains a duplicate member: {member.name}"
                )
            names.add(normalized_name)
        bundle.extractall(destination, members=members, filter="data")

    if not (destination / ".open-next/worker.js").is_file():
        raise ValueError("Preview artifact does not contain .open-next/worker.js")


def main(argv: list[str]) -> None:
    if len(argv) != 3:
        raise SystemExit(
            "Usage: extract-preview-artifact.py <preview-worker.tar> <destination>"
        )
    try:
        extract_preview_artifact(Path(argv[1]), Path(argv[2]))
    except (OSError, tarfile.TarError, ValueError) as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main(sys.argv)
