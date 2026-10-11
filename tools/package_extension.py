#!/usr/bin/env python3
"""Offline, reproducible runtime ZIP creation and source-comparison verification.

No bundling, network access or browser execution. Keep RUNTIME_FILES explicit:
adding a local dependency requires adding its path here, never a broad glob.
"""
import argparse
import hashlib
import io
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import posixpath
import re
import stat
import subprocess
import sys
from urllib.parse import unquote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STAMP = (1980, 1, 1, 0, 0, 0)
RUNTIME_FILES = (
    "manifest.json",
    "newtab.html", "options.html",
    "prompts.html", "prompts.js", "prompts.css", "prompt-library-entry.css",
    "shared/local-prompts-store.js", "shared/local-prompts-controller.js", "shared/local-prompts-view.js",
    "context-menu.js", "drive-backup.js", "error-handler.js", "favicon-cache.js",
    "i18n.js", "newtab.js", "options.js", "storage.js",
    "workspaces.css", "appearance.css", "bookmark-import.css", "complete-backup.css", "context-menu.css", "update-checker.css",
    "dashboard-template-gallery.css", "dashboard-templates.css", "local-focus.css",
    "local-countdown.css", "local-month-calendar.css", "local-scratchpad.css", "local-tasks.css", "newtab.css", "options.css", "shortcut-finder.css",
    "shared/month-calendar.js", "shared/world-clocks.js", "shared/appearance.js", "shared/bookmark-import.js", "shared/bookmark-import-view.js", "shared/bookmark-export.js",
    "shared/dashboard-template-registry.js", "shared/dialog-focus.js", "shared/layout.js",
    "shared/layout-identity.js", "shared/local-calculator.js",
    "shared/local-countdown-store.js", "shared/local-countdown-controller.js", "shared/local-countdown-view.js",
    "shared/local-content-lifecycle.js", "shared/local-focus-controller.js",
    "shared/local-focus-store.js", "shared/local-focus-view.js",
    "shared/local-scratchpad-store.js", "shared/local-scratchpad-controller.js", "shared/local-scratchpad-view.js",
    "shared/local-tasks-controller.js", "shared/local-tasks-store.js", "shared/local-tasks-view.js",
    "shared/update-checker.js", "shared/update-view.js",
    "shared/complete-backup.js", "shared/complete-backup-view.js",
    "shared/settings-search.js", "shared/search-template.js", "shared/shortcut-finder.js", "shared/shortcut-finder-host.js",
    "shared/shortcut-finder-view.js", "shared/workspace-presets.js", "shared/workspace-presets-view.js", "shared/workspaces.js", "shared/workspaces-view.js",
    "_locales/en/messages.json", "_locales/zh_CN/messages.json",
    "assets/icon16.png", "assets/icon48.png", "assets/icon128.png",
)


class PackageError(ValueError):
    pass


def safe_name(name):
    if (not isinstance(name, str) or not name or name.startswith("/")
            or any(part in ("", ".", "..") for part in name.split("/"))
            or re.search(r"[\\:%\x00-\x1f]", name)):
        raise PackageError(f"Unsafe package path: {name!r}")
    return name


def no_symlinks(path):
    for part in (path, *path.parents):
        if part.is_symlink():
            raise PackageError(f"Symlink is not allowed: {part}")


def require_ref(files, owner, ref, *, local_only=False):
    if not isinstance(ref, str) or not ref.strip():
        raise PackageError(f"Empty or invalid reference in {owner}")
    ref = ref.strip()
    url = urlsplit(ref)
    if url.scheme or url.netloc:
        if local_only:
            raise PackageError(f"Expected local reference in {owner}: {ref}")
        return
    path = unquote(url.path)
    if not path:
        if local_only:
            raise PackageError(f"Expected a file reference in {owner}: {ref}")
        return  # fragment-only reference
    if "\\" in path or re.search(r"[\x00-\x1f]", path):
        raise PackageError(f"Unsafe reference in {owner}: {ref}")
    target = posixpath.normpath(posixpath.join(posixpath.dirname(owner), path))
    if path.startswith("/"):
        target = posixpath.normpath(path.lstrip("/"))
    safe_name(target)
    if target not in files:
        raise PackageError(f"Missing packaged reference: {owner} -> {ref} ({target})")


class HTMLReferences(HTMLParser):
    def __init__(self, files, owner):
        super().__init__(convert_charrefs=True)
        self.files, self.owner = files, owner

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = {"script": "src", "link": "href", "img": "src"}.get(tag)
        if key and key in attrs:
            require_ref(self.files, self.owner, attrs[key])

    handle_startendtag = handle_starttag


def validate(files):
    manifest = json.loads(files["manifest.json"])
    refs = list(manifest.get("chrome_url_overrides", {}).values())
    refs += list(manifest.get("icons", {}).values())
    for key in ("options_page", "devtools_page"):
        if key in manifest:
            refs.append(manifest[key])
    if "options_ui" in manifest:
        refs.append(manifest["options_ui"]["page"])
    for key in ("action", "browser_action", "page_action"):
        action = manifest.get(key, {})
        if "default_popup" in action:
            refs.append(action["default_popup"])
        icons = action.get("default_icon", {})
        refs.extend([icons] if isinstance(icons, str) else icons.values())
    background = manifest.get("background", {})
    refs.extend(background.get("scripts", []))
    refs.extend(background[key] for key in ("service_worker", "page") if key in background)
    for script in manifest.get("content_scripts", []):
        refs.extend(script.get("js", []))
        refs.extend(script.get("css", []))
    for resources in manifest.get("web_accessible_resources", []):
        refs.extend(resources["resources"] if isinstance(resources, dict) else [resources])
    refs.extend(manifest.get("sandbox", {}).get("pages", []))
    if "side_panel" in manifest:
        refs.append(manifest["side_panel"]["default_path"])
    refs.append(f'_locales/{manifest["default_locale"]}/messages.json')
    for ref in refs:
        require_ref(files, "manifest.json", ref, local_only=True)
    for name, data in files.items():
        if name.endswith(".json"):
            json.loads(data)
        if name.endswith(".html"):
            HTMLReferences(files, name).feed(data.decode("utf-8"))
        if name.endswith(".css"):
            css = re.sub(r"/\*.*?\*/", "", data.decode("utf-8"), flags=re.S)
            for match in re.finditer(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*?))\s*\)", css, re.I):
                require_ref(files, name, next(group for group in match.groups() if group is not None))
            # Local @import strings do not use url(), but also need packaging.
            for ref in re.findall(r"@import\s+[\"']([^\"']+)[\"']", css, re.I):
                require_ref(files, name, ref)
    return manifest


def collect(root, names=RUNTIME_FILES):
    files = {}
    for name in sorted(names):
        safe_name(name)
        if name in files:
            raise PackageError(f"Duplicate package path: {name}")
        path = root / name
        no_symlinks(path)
        if not path.is_file():
            raise PackageError(f"Missing runtime file: {name}")
        files[name] = path.read_bytes()
    validate(files)
    return files


def canonical_zip(files):
    """Only trusted, explicitly collected source bytes are passed to ZipFile."""
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as package:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo(name, STAMP)
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            package.writestr(entry, data)
    return stream.getvalue()


def verify(archive, files):
    # Never parse/decompress an untrusted archive. Compare it with the canonical
    # ZIP of our trusted source snapshot, bounding reads before touching payloads.
    expected = canonical_zip(files)
    with Path(archive).open("rb") as stream:
        if os.fstat(stream.fileno()).st_size != len(expected):
            raise PackageError("ZIP size differs from the canonical source package")
        for offset in range(0, len(expected), 65536):
            if stream.read(65536) != expected[offset:offset + 65536]:
                raise PackageError("ZIP content or metadata differs from the canonical source package")
        if stream.read(1):
            raise PackageError("Unexpected trailing ZIP bytes")


def build(root, output, files):
    # Never overwrite source, a historical archive or an existing output.
    output = Path(output).absolute()
    if ".." in output.parts:
        raise PackageError("Output path must not contain parent traversal")
    no_symlinks(output)
    resolved_root = root.resolve()
    if output.suffix.lower() != ".zip":
        raise PackageError("Output must end in .zip")
    if output.is_relative_to(resolved_root) and not output.is_relative_to(resolved_root / "dist"):
        raise PackageError("Output inside the source tree must be in dist/")
    output.parent.mkdir(parents=True, exist_ok=True)
    stream = output.open("xb")  # Exclusive creation happens before cleanup is armed.
    try:
        with stream:
            stream.write(canonical_zip(files))
        verify(output, files)
    except Exception:
        output.unlink()
        raise
    return output


def source_revision(root):
    try:
        revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], stderr=subprocess.DEVNULL, text=True).strip()
        dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=normal"], stderr=subprocess.DEVNULL, text=True)
        return revision + (" (working tree modified)" if dirty else " (clean)")
    except (OSError, subprocess.CalledProcessError):
        return "unavailable (not a Git checkout)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--output", type=Path, help="new ZIP path; existing files are never overwritten")
    group.add_argument("--verify", type=Path, help="verify a ZIP against the current source snapshot")
    args = parser.parse_args()
    try:
        files = collect(ROOT)
        manifest = json.loads(files["manifest.json"])
        if args.verify:
            archive = args.verify
            no_symlinks(archive.absolute())
            verify(archive, files)
        else:
            version = manifest["version"]
            if not re.fullmatch(r"\d+(?:\.\d+){0,3}", version):
                raise PackageError("Invalid extension version")
            archive = build(ROOT, args.output or ROOT / "dist" / f"local-itab-{version}.zip", files)
        print(f"Verified package: {archive}")
        print(f"Source revision: {source_revision(ROOT)}")
        print(f"Runtime files: {len(files)}; source bytes: {sum(map(len, files.values()))}")
        print(f"SHA256: {hashlib.sha256(canonical_zip(files)).hexdigest()}")
        print("Static packaging checks passed. Browser testing: NOT performed by this tool.")
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Packaging failed: {error}\n")


if __name__ == "__main__":
    main()
