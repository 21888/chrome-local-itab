"""Run with python3 -m unittest discover -s tests -p '*_test.py'."""
import importlib.util
import errno
import json
from pathlib import Path
import tempfile
import struct
import unittest
import warnings
import zipfile

SPEC = importlib.util.spec_from_file_location("package_extension", Path(__file__).resolve().parents[1] / "tools/package_extension.py")
pack = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pack)


class PackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = pack.collect(pack.ROOT)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / "source"
        self.root.mkdir()
        for name, data in self.source.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.output = self.root.parent / "extension.zip"

    def make_symlink(self, link, target, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
        except OSError as error:
            if error.errno in (errno.EPERM, errno.EACCES, errno.ENOSYS, errno.ENOTSUP):
                self.skipTest(f"Symlink creation unavailable: {error}")
            raise

    def test_runtime_inventory_and_determinism(self):
        files = pack.collect(self.root)
        pack.build(self.root, self.output, files)
        other = self.output.with_name("repeat.zip")
        # Input timestamps and mapping insertion order do not affect the ZIP.
        (self.root / "newtab.js").touch()
        pack.build(self.root, other, dict(reversed(list(files.items()))))
        self.assertEqual(self.output.read_bytes(), other.read_bytes())
        pack.verify(other, files)
        with zipfile.ZipFile(other) as archive:
            self.assertEqual(66, len(archive.namelist()))
            self.assertIn("shared/month-calendar.js", archive.namelist())
            self.assertIn("local-month-calendar.css", archive.namelist())
            self.assertIn("shared/search-template.js", archive.namelist())
            self.assertIn("shared/settings-search.js", archive.namelist())
            self.assertIn("_locales/zh_CN/messages.json", archive.namelist())
            self.assertNotIn("assets/1.jpg", archive.namelist())
            self.assertFalse(any(name.startswith(("tests/", "release/", "docs/", ".git", "tools/")) for name in archive.namelist()))

    def test_unlisted_secrets_are_not_collected(self):
        (self.root / ".env").write_text("secret")
        (self.root / "shared/token.json").write_text('{"secret":true}')
        self.assertEqual(self.source, pack.collect(self.root))

    def test_missing_runtime_file(self):
        (self.root / "shared/search-template.js").unlink()
        with self.assertRaisesRegex(pack.PackageError, "Missing runtime file"):
            pack.collect(self.root)

    def test_missing_html_script_link_and_image(self):
        for markup in ('<script src="missing.js"></script>', '<link href="missing.css" rel="stylesheet">', '<img src="missing.png">'):
            with self.subTest(markup=markup), self.assertRaisesRegex(pack.PackageError, "Missing packaged reference"):
                pack.validate({**self.source, "newtab.html": markup.encode()})

    def test_missing_css_url_and_import(self):
        for css in ('a{background:url("missing.png")}', "a{background:url(missing.png)}", "@import 'missing.css';"):
            with self.subTest(css=css), self.assertRaisesRegex(pack.PackageError, "Missing packaged reference"):
                pack.validate({**self.source, "newtab.css": css.encode()})

    def test_external_data_fragment_and_relative_refs(self):
        files = {**self.source, "shared/test.css": b""}
        for ref in ("https://example.com/a.png", "data:image/svg+xml;base64,YQ==", "#local", "../assets/icon16.png?x=1#x"):
            pack.require_ref(files, "shared/test.css", ref)
        pack.require_ref(files, "newtab.html", "/assets/icon16.png")

    def test_missing_manifest_entrypoints_icons_and_locale(self):
        for change in ({"options_page": "absent.html"}, {"icons": {"16": "absent.png"}}, {"default_locale": "missing"}, {"background": {"service_worker": "missing.js"}}, {"action": {"default_popup": "absent.html"}}):
            manifest = {**json.loads(self.source["manifest.json"]), **change}
            with self.subTest(change=change), self.assertRaisesRegex(pack.PackageError, "Missing packaged reference"):
                pack.validate({**self.source, "manifest.json": json.dumps(manifest).encode()})

    def test_invalid_locale_json(self):
        with self.assertRaises(ValueError):
            pack.validate({**self.source, "_locales/en/messages.json": b"{"})

    def test_reference_escape(self):
        for ref in ("../outside.js", "%2e%2e/outside.js", "..\\outside.js", "/../../outside.js"):
            with self.subTest(ref=ref), self.assertRaises(pack.PackageError):
                pack.require_ref(self.source, "newtab.html", ref)

    def test_unsafe_and_duplicate_inventory(self):
        for names in (("../manifest.json",), ("/manifest.json",), ("a\\b",), ("manifest.json", "manifest.json")):
            with self.subTest(names=names), self.assertRaises(pack.PackageError):
                pack.collect(self.root, names)

    def test_symlink_file_and_directory(self):
        path = self.root / "newtab.js"
        path.unlink()
        self.make_symlink(path, pack.ROOT / "newtab.js")
        with self.assertRaisesRegex(pack.PackageError, "Symlink"):
            pack.collect(self.root)
        path.unlink()
        path.write_bytes(self.source["newtab.js"])
        shared = self.root / "shared"
        shared.rename(self.root / "old-shared")
        self.make_symlink(shared, self.root / "old-shared", directory=True)
        with self.assertRaisesRegex(pack.PackageError, "Symlink"):
            pack.collect(self.root)

    def test_unsafe_output(self):
        for output in (self.root / "release/new.zip", self.root / "newtab.js", self.root / "dist/../release/new.zip"):
            with self.subTest(output=output), self.assertRaises(pack.PackageError):
                pack.build(self.root, output, self.source)
        self.assertEqual(self.source["newtab.js"], (self.root / "newtab.js").read_bytes())

    def test_existing_output_preserved(self):
        self.output.write_bytes(b"historical")
        with self.assertRaises(FileExistsError):
            pack.build(self.root, self.output, self.source)
        self.assertEqual(b"historical", self.output.read_bytes())

    def test_symlink_output_parent(self):
        self.make_symlink(self.root / "dist", self.root.parent, directory=True)
        with self.assertRaisesRegex(pack.PackageError, "Symlink"):
            pack.build(self.root, self.root / "dist/new.zip", self.source)

    def test_archive_duplicate_and_unsafe_paths(self):
        for names in (("manifest.json", "manifest.json"), ("../outside.js",)):
            with self.subTest(names=names):
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    with zipfile.ZipFile(self.output, "w") as archive:
                        for name in names:
                            archive.writestr(name, b"{}")
                with self.assertRaises(pack.PackageError):
                    pack.verify(self.output, self.source)

    def test_archive_extra_bytes_and_untrusted_headers(self):
        canonical = pack.canonical_zip(self.source)
        variants = [b"prefix" + canonical, canonical + b"trailing"]
        central = canonical.index(b"PK\x01\x02")
        for relative, value in ((36, 1), (8, 1), (6, 64)):
            changed = bytearray(canonical)
            struct.pack_into("<H", changed, central + relative, value)
            variants.append(bytes(changed))
        for data in variants:
            with self.subTest(length=len(data)):
                self.output.write_bytes(data)
                with self.assertRaises(pack.PackageError):
                    pack.verify(self.output, self.source)

    def test_archive_oversized_entry_is_not_decompressed(self):
        with zipfile.ZipFile(self.output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", b"x" * (16 * 1024 * 1024))
        # Verification must not call the untrusted archive decompressor at all.
        from unittest.mock import patch
        with patch.object(zipfile.ZipFile, "read", side_effect=AssertionError("untrusted read")):
            with self.assertRaises(pack.PackageError):
                pack.verify(self.output, self.source)

    def test_failed_verification_removes_closed_output(self):
        from unittest.mock import patch
        with patch.object(pack, "verify", side_effect=pack.PackageError("forced verification failure")):
            with self.assertRaisesRegex(pack.PackageError, "forced verification"):
                pack.build(self.root, self.output, self.source)
        self.assertFalse(self.output.exists())

    def test_archive_missing_file_and_changed_source(self):
        pack.build(self.root, self.output, self.source)
        with self.assertRaisesRegex(pack.PackageError, "differs"):
            pack.verify(self.output, {**self.source, "newtab.js": b"changed"})
        with zipfile.ZipFile(self.output, "w") as archive:
            archive.writestr("manifest.json", self.source["manifest.json"])
        with self.assertRaisesRegex(pack.PackageError, "differs"):
            pack.verify(self.output, self.source)


if __name__ == "__main__":
    unittest.main()
