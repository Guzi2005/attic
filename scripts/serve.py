# -*- coding: utf-8 -*-
"""Tiny static server that avoids Windows hostname UnicodeDecodeError."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import json
import sys
import hashlib
import io
from urllib.parse import urlparse
from PIL import Image, UnidentifiedImageError

ROOT = Path(r"D:\D盘桌面\attic\public")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class QuietHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".css": "text/css",
        ".html": "text/html",
    }

    def log_message(self, fmt, *args):
        try:
            sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
            sys.stdout.flush()
        except OSError:
            pass

    def _local_only(self):
        return self.client_address[0] in ("127.0.0.1", "::1")

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path not in ("/works.json", "/api/images"):
            self.send_error(404)
            return
        if not self._local_only():
            self.send_error(403, "localhost only")
            return
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            self.send_error(403, 'same-origin requests only')
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.send_error(400, 'invalid length')
            return
        if not 0 < length <= 20 * 1024 * 1024:
            self.send_error(413, 'maximum upload size is 20 MB')
            return
        raw = self.rfile.read(length)
        if path == '/api/images':
            try:
                with Image.open(io.BytesIO(raw)) as im:
                    ext = {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp', 'GIF': 'gif'}.get(im.format)
                    width, height = im.size
                    if not ext or width * height > 50_000_000:
                        raise ValueError('unsupported image or image too large')
                    im.verify()
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
                self.send_error(400, 'please upload a valid PNG, JPEG, WebP or GIF')
                return
            name = hashlib.sha256(raw).hexdigest()[:24] + '.' + ext
            folder = ROOT / 'parts' / 'portfolio' / 'uploads'
            folder.mkdir(parents=True, exist_ok=True)
            dest = folder / name
            for existing in (ROOT / 'parts' / 'portfolio').glob('*'):
                if existing.is_file() and existing.stat().st_size == len(raw) and hashlib.sha256(existing.read_bytes()).digest() == hashlib.sha256(raw).digest():
                    dest = existing
                    break
            if not dest.exists():
                dest.write_bytes(raw)
            payload = json.dumps({'src': './' + dest.relative_to(ROOT).as_posix(), 'width': width, 'height': height}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as err:
            self.send_error(400, str(err))
            return
        if not isinstance(data, list):
            self.send_error(400, "works.json must be an array")
            return
        dest = ROOT / "works.json"
        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        payload = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_PUT(self):
        self.do_POST()


class LocalServer(ThreadingHTTPServer):
    def server_bind(self):
        # Skip socket.getfqdn() which crashes on non-UTF8 Windows hostnames
        self.socket.bind(self.server_address)
        self.server_address = self.socket.getsockname()
        self.server_name = "localhost"
        self.server_port = self.server_address[1]


def main():
    handler = partial(QuietHandler, directory=str(ROOT))
    httpd = LocalServer(("127.0.0.1", PORT), handler)
    print(f"serving {ROOT} at http://127.0.0.1:{PORT}/", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
