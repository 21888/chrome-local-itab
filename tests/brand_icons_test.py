"""Dependency-free PNG/reference guards for the approved Local iTab product mark."""
import hashlib
import json
from pathlib import Path
import struct
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]


def rgba_png(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, compressed = 8, bytearray()
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + length]
        assert zlib.crc32(kind + chunk) & 0xffffffff == struct.unpack('>I', data[offset + 8 + length:offset + 12 + length])[0]
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunk)
            assert (depth, color, compression, filtering, interlace) == (8, 6, 0, 0, 0)
        if kind == b'IDAT':
            compressed.extend(chunk)
        offset += length + 12
    raw = zlib.decompress(compressed)
    stride = width * 4
    assert len(raw) == height * (stride + 1)
    rows, previous = [], bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        kind, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left, above, corner = row[x - 4] if x >= 4 else 0, previous[x], previous[x - 4] if x >= 4 else 0
            if kind == 0: predictor = 0
            elif kind == 1: predictor = left
            elif kind == 2: predictor = above
            elif kind == 3: predictor = (left + above) // 2
            elif kind == 4:
                p = left + above - corner
                distances = [abs(p - v) for v in (left, above, corner)]
                predictor = (left, above, corner)[distances.index(min(distances))]
            else: raise AssertionError('Unsupported PNG filter')
            row[x] = (row[x] + predictor) & 255
        rows.append(row)
        previous = row
    return width, height, rows


class BrandIconsTest(unittest.TestCase):
    def test_real_rgba_png_dimensions_transparency_and_safe_padding(self):
        for size in (16, 32, 48, 128):
            with self.subTest(size=size):
                width, height, rows = rgba_png(ROOT / f'assets/icon{size}.png')
                self.assertEqual((width, height), (size, size))
                occupied = [(x, y) for y, row in enumerate(rows) for x in range(size) if row[x * 4 + 3]]
                bounds = (min(x for x, y in occupied), min(y for x, y in occupied), max(x for x, y in occupied) + 1, max(y for x, y in occupied) + 1)
                self.assertGreaterEqual(min(bounds[0], bounds[1], size - bounds[2], size - bounds[3]), 1)
                self.assertTrue(any(row[x * 4 + 3] == 255 for row in rows for x in range(size)))
                self.assertTrue(any(0 < row[x * 4 + 3] < 255 for row in rows for x in range(size)))
                if size == 128:
                    self.assertEqual(bounds, (16, 17, 112, 111))

    def test_manifest_and_all_page_favicons_use_local_product_assets(self):
        manifest = json.loads((ROOT / 'manifest.json').read_text())
        self.assertEqual(manifest['icons'], {str(size): f'assets/icon{size}.png' for size in (16, 32, 48, 128)})
        for name in ('newtab', 'options', 'prompts', 'collections'):
            self.assertIn('<link rel="icon" type="image/png" sizes="32x32" href="assets/icon32.png">', (ROOT / f'{name}.html').read_text())
        for name in ('local-prompts', 'local-ai-collections'):
            source = (ROOT / f'shared/{name}-view.js').read_text()
            self.assertIn("this.el('img', 'prompt-brand-mark')", source)
            self.assertIn("mark.src = 'assets/icon48.png'", source)
            self.assertIn("mark.alt = ''", source)
        self.assertIn('class="template-brand-mark" src="assets/icon48.png"', (ROOT / 'newtab.html').read_text())
        self.assertIn('class="options-brand-mark" src="assets/icon48.png"', (ROOT / 'options.html').read_text())

    def test_assets_match_approved_exports(self):
        expected = json.loads((ROOT / 'docs/brand-icon-hashes.json').read_text())
        for name, digest in expected.items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
