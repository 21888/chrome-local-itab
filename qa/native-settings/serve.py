"""Serve an explicitly generated synthetic fixture on loopback only."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class FixtureHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None

    def send_head(self):
        root = Path(self.directory).resolve()
        target = Path(self.translate_path(self.path)).resolve()
        if target != root and root not in target.parents:
            self.send_error(403, 'Outside fixture')
            return None
        return super().send_head()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture', type=Path)
    parser.add_argument('--port', type=int, default=8768)
    args = parser.parse_args()
    root = args.fixture.resolve()
    if not (root / 'BUILD-PROVENANCE.json').is_file() or not (root / 'options-rich2.html').is_file():
        parser.error('Expected generated fixture, not repository/user directory')
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(FixtureHandler, directory=str(root))) as server:
        print(f'http://127.0.0.1:{args.port}/options-rich2.html', flush=True)
        server.serve_forever()

if __name__ == '__main__':
    main()
