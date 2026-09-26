#!/usr/bin/env python3
"""
Локальный сервер сайта.

  python3 tools/serve.py [порт]      по умолчанию 4173, слушает всю сеть

От `python3 -m http.server` отличается поддержкой Range-запросов: без них Safari на iPhone
не проигрывает видео (анимацию знака) и показывает только постер. Для просмотра с телефона
откройте http://<IP компьютера>:<порт> в той же Wi-Fi сети, адреса печатаются при запуске.
"""
import os
import re
import socket
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')  # правки видны сразу; неизменённое отдаётся по 304
        super().end_headers()

    def send_head(self):
        self._limit = None
        header = self.headers.get('Range')
        path = self.translate_path(self.path)
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip()) if header else None
        if not match or not (match.group(1) or match.group(2)) or not os.path.isfile(path):
            return super().send_head()

        size = os.path.getsize(path)
        first, last = match.groups()
        if first == '':  # bytes=-N — последние N байт
            start, end = max(0, size - int(last)), size - 1
        else:
            start, end = int(first), (min(int(last), size - 1) if last else size - 1)
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None

        f = open(path, 'rb')
        f.seek(start)
        self._limit = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self._limit))
        self.send_header('Last-Modified', self.date_time_string(os.stat(path).st_mtime))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        limit = self._limit
        try:
            if limit is None:
                return super().copyfile(source, outputfile)
            while limit > 0:
                chunk = source.read(min(64 * 1024, limit))
                if not chunk:
                    break
                outputfile.write(chunk)
                limit -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Safari сам обрывает загрузку, когда ему хватило данных


class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)  # и IPv4, и IPv6
        super().server_bind()


def lan_addresses():
    try:
        out = subprocess.run(['ifconfig'], capture_output=True, text=True).stdout
    except OSError:
        return []
    ips = re.findall(r'inet (\d+\.\d+\.\d+\.\d+)', out)
    return [ip for ip in ips if not ip.startswith(('127.', '169.254.'))]


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    try:
        server = DualStackServer(('::', port), Handler)
    except OSError:
        server = ThreadingHTTPServer(('0.0.0.0', port), Handler)  # системы без IPv6
    print(f'Сайт: http://localhost:{port}')
    for ip in lan_addresses():
        print(f'      http://{ip}:{port}')
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == '__main__':
    main()
