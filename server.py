#!/usr/bin/env python3
import http.server
import webbrowser
import os

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress request logs

print(f"サーバー起動: http://localhost:{PORT}")
print("終了するには Ctrl+C を押してください")
webbrowser.open(f"http://localhost:{PORT}")

with http.server.HTTPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
