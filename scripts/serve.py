# -*- coding: utf-8 -*-
"""Tiny static server that avoids Windows hostname UnicodeDecodeError."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import sys

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
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


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
