#!/usr/bin/env python3

import os
import stat
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


def ensure_within_bundle(path: Path, bundle_root: Path) -> None:
    try:
        path.relative_to(bundle_root)
    except ValueError as error:
        raise ValueError(
            f"Preview artifact link resolves outside the preview Worker bundle: {path}"
        ) from error


def normalize_metadata(member: tarfile.TarInfo) -> tarfile.TarInfo:
    member.uid = 0
    member.gid = 0
    member.uname = ""
    member.gname = ""
    member.mtime = 0
    return member


def add_entry(
    archive: tarfile.TarFile,
    source_path: Path,
    archive_path: PurePosixPath,
    bundle_root: Path,
    directory_ancestors: frozenset[tuple[int, int]],
) -> None:
    if source_path.is_symlink():
        resolved_path = source_path.resolve(strict=False)
        ensure_within_bundle(resolved_path, bundle_root)
        if not resolved_path.exists():
            return
        resolved_path = resolved_path.resolve(strict=True)
    else:
        resolved_path = source_path.resolve(strict=True)

    ensure_within_bundle(resolved_path, bundle_root)
    entry_stat = resolved_path.stat()
    member = normalize_metadata(
        archive.gettarinfo(str(resolved_path), arcname=str(archive_path))
    )

    if stat.S_ISDIR(entry_stat.st_mode):
        identity = (entry_stat.st_dev, entry_stat.st_ino)
        if identity in directory_ancestors:
            raise ValueError(f"Preview artifact contains a directory link cycle: {source_path}")
        archive.addfile(member)
        ancestors = directory_ancestors | {identity}
        for child in sorted(resolved_path.iterdir(), key=lambda path: path.name):
            add_entry(
                archive,
                child,
                archive_path / child.name,
                bundle_root,
                ancestors,
            )
        return

    if stat.S_ISREG(entry_stat.st_mode):
        with resolved_path.open("rb") as source_file:
            archive.addfile(member, source_file)
        return

    raise ValueError(
        f"Preview artifact may contain only regular files and directories: {source_path}"
    )


def package_preview_artifact(source: Path, archive_path: Path) -> None:
    if source.is_symlink():
        raise ValueError("Preview artifact source must not be a symbolic link")
    bundle_root = source.resolve(strict=True)
    if not bundle_root.is_dir() or source.name != ".open-next":
        raise ValueError("Preview artifact source must be a .open-next directory")

    archive_parent = archive_path.parent.resolve(strict=True)
    resolved_archive = archive_parent / archive_path.name
    try:
        resolved_archive.relative_to(bundle_root)
    except ValueError:
        pass
    else:
        raise ValueError("Preview artifact archive must be outside the .open-next directory")

    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".{archive_path.name}.",
            suffix=".tmp",
            dir=archive_parent,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)

        with tarfile.open(
            temporary_path,
            mode="w",
            format=tarfile.PAX_FORMAT,
            dereference=True,
        ) as archive:
            add_entry(
                archive,
                bundle_root,
                PurePosixPath(".open-next"),
                bundle_root,
                frozenset(),
            )
        os.replace(temporary_path, resolved_archive)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main(argv: list[str]) -> None:
    if len(argv) != 3:
        raise SystemExit(
            "Usage: package-preview-artifact.py <.open-next> <preview-worker.tar>"
        )
    try:
        package_preview_artifact(Path(argv[1]), Path(argv[2]))
    except (OSError, tarfile.TarError, ValueError) as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main(sys.argv)
