#!/usr/bin/env python3
"""Cover Lab: serves this folder on localhost and lists ./inspo for the photo library.
   python3 server.py            (opens the browser)   |   double-click 'Cover Lab.command'
Stdlib only, nothing to install."""
import http.server
import json
import os
import shutil
import socketserver
import sys
import threading
import time
import webbrowser
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = (".jpg", ".jpeg", ".png", ".webp", ".gif")
MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
INSPO, TRASH = os.path.join(ROOT, "inspo"), os.path.join(ROOT, "trash")
MAX = 40 * 1024 * 1024
LOG = os.path.join(ROOT, "activity.log")


def clean(name):
    """safe file name: (stem, ext)"""
    stem, ext = os.path.splitext(os.path.basename(name))
    stem = "".join(ch if (ch.isalnum() or ch in "-_ ") else "_" for ch in stem).strip(" _") or "photo"
    return stem, ext.lower()


def unique(folder, stem, ext):
    n, i = stem + ext, 2
    while os.path.exists(os.path.join(folder, n)):
        n, i = f"{stem}_{i}{ext}", i + 1
    return n


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/trash":
            files = [f for f in os.listdir(TRASH) if f.lower().endswith(IMG)] if os.path.isdir(TRASH) else []
            files.sort(key=lambda f: (-int(os.path.getmtime(os.path.join(TRASH, f))), f))
            return self.reply(files)
        if self.path.split("?")[0] == "/api/inspo":
            files = [f for f in os.listdir(INSPO) if f.lower().endswith(IMG)] if os.path.isdir(INSPO) else []
            files.sort(key=lambda f: (-int(os.path.getmtime(os.path.join(INSPO, f))), f))
            return self.reply(files)
        return super().do_GET()

    def reply(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """/api/save?name=  raw image -> exports/        /api/upload?name=  raw image -> inspo/
           /api/delete?name=  inspo -> trash/            /api/restore?name=  trash -> inspo/
           /api/rename?from=&to=  inside inspo/"""
        u, q = urlparse(self.path), None
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        route = u.path
        if route in ("/api/upload", "/api/delete", "/api/restore", "/api/rename"):
            try:                                              # audit trail: what was asked, and by which page
                with open(LOG, "a") as lf:
                    lf.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {route}  {q}  referer={self.headers.get('Referer', '-')}  ua={self.headers.get('User-Agent', '-')[:60]}\n")
            except OSError:
                pass
        try:
            if route in ("/api/save", "/api/upload"):
                n = int(self.headers.get("Content-Length", 0))
                if n > MAX:
                    return self.reply({"error": "too big"}, 413)
                data = self.rfile.read(n)
                stem, ext = clean(q.get("name", "cover.png"))
                if route == "/api/save":
                    folder, ext = os.path.join(ROOT, "exports"), ext or ".png"
                    name = stem + ext
                else:
                    folder = INSPO
                    if ext not in IMG:
                        ext = MIME.get(self.headers.get("Content-Type", ""), "")
                    if ext not in IMG:
                        return self.reply({"error": "not an image"}, 400)
                    name = unique(folder, stem, ext)
                os.makedirs(folder, exist_ok=True)
                with open(os.path.join(folder, name), "wb") as f:
                    f.write(data)
                return self.reply({"saved": os.path.basename(folder) + "/" + name, "name": name, "bytes": len(data)})
            if route in ("/api/delete", "/api/restore"):
                src_dir, dst_dir = (INSPO, TRASH) if route == "/api/delete" else (TRASH, INSPO)
                stem, ext = clean(q.get("name", ""))
                src = os.path.join(src_dir, stem + ext)
                if not os.path.isfile(src):
                    # names are cleaned on upload, but keep exact match for older files
                    src = os.path.join(src_dir, os.path.basename(q.get("name", "")))
                    if not os.path.isfile(src):
                        return self.reply({"error": "not found"}, 404)
                s2, e2 = os.path.splitext(os.path.basename(src))
                os.makedirs(dst_dir, exist_ok=True)
                name = unique(dst_dir, s2, e2)
                shutil.move(src, os.path.join(dst_dir, name))
                return self.reply({"trashed" if route == "/api/delete" else "name": name})
            if route == "/api/rename":
                src = os.path.join(INSPO, os.path.basename(q.get("from", "")))
                if not os.path.isfile(src):
                    return self.reply({"error": "not found"}, 404)
                _, old_ext = os.path.splitext(src)
                stem, _ = clean(q.get("to", "photo"))
                name = stem + old_ext
                if name != os.path.basename(src):
                    name = unique(INSPO, stem, old_ext)
                    os.rename(src, os.path.join(INSPO, name))
                return self.reply({"name": name})
        except OSError as e:
            return self.reply({"error": str(e)}, 500)
        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


class Srv(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8765
    for p in range(port, port + 20):
        try:
            srv = Srv(("127.0.0.1", p), H)
            break
        except OSError:
            continue
    else:
        sys.exit("no free port")
    url = f"http://localhost:{p}/"
    print(f"Cover Lab  {url}   (ctrl+c to stop)")
    if "--no-open" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
