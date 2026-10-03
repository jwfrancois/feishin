#!/usr/bin/env python3
"""Fake Jellyfin server for verifying the Feishin audio proxy pipeline end-to-end.
Serves a real MP3 with HTTP Range support + minimal JSON endpoints."""
import json
import re
import socketserver
import urllib.parse
from http.server import BaseHTTPRequestHandler

MP3 = "/home/z/my-project/public/media/audio/tr0000.mp3"
MP3_2 = "/home/z/my-project/public/media/audio/tr0001.mp3"

with open(MP3, "rb") as f:
    AUDIO_1 = f.read()
with open(MP3_2, "rb") as f:
    AUDIO_2 = f.read()

ALBUM = {
    "Items": [
        {
            "Id": "album1",
            "Name": "Pipeline Test Album",
            "Type": "MusicAlbum",
            "ProductionYear": 2024,
            "Genres": ["Test"],
            "ChildCount": 2,
            "RunTimeTicks": 30 * 1e7,
            "AlbumArtists": [{"Name": "Test Artist", "Id": "artist1"}],
            "ImageTags": {},
            "UserData": {"PlayCount": 0},
        }
    ],
    "TotalRecordCount": 1,
}

TRACKS = {
    "Items": [
        {
            "Id": "track1",
            "Name": "Pipeline Test Song One",
            "Type": "Audio",
            "Album": "Pipeline Test Album",
            "AlbumId": "album1",
            "Container": "mp3",
            "IndexNumber": 1,
            "RunTimeTicks": 15 * 1e7,
            "Genres": ["Test"],
            "Artists": ["Test Artist"],
            "AlbumArtists": [{"Name": "Test Artist", "Id": "artist1"}],
            "UserData": {"PlayCount": 3},
        },
        {
            "Id": "track2",
            "Name": "Pipeline Test Song Two",
            "Type": "Audio",
            "Album": "Pipeline Test Album",
            "AlbumId": "album1",
            "Container": "mp3",
            "IndexNumber": 2,
            "RunTimeTicks": 15 * 1e7,
            "Genres": ["Test"],
            "Artists": ["Test Artist"],
            "AlbumArtists": [{"Name": "Test Artist", "Id": "artist1"}],
            "UserData": {"PlayCount": 1},
        },
    ],
    "TotalRecordCount": 2,
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/Users/AuthenticateByName":
            self._json({"AccessToken": "faketoken", "User": {"Id": "user1", "Name": "testuser"}})
        elif parsed.path.startswith("/Sessions/Playing"):
            self._json({})
        else:
            self._json({})

    def do_DELETE(self):
        self._json({})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        path = parsed.path
        if path == "/System/Info":
            self._json({"ServerName": "FakeJF", "Version": "10.11.0"})
        elif path == "/Users/user1/Items":
            self._json({"Items": [{"Id": "lib1", "Name": "Music", "CollectionType": "music"}], "TotalRecordCount": 1})
        elif path == "/Items" and qs.get("includeItemTypes", [""])[0] == "MusicAlbum":
            self._json(ALBUM)
        elif path == "/Items" and "parentId=album1" in parsed.query:
            self._json(TRACKS)
        elif path == "/Items":
            self._json({"Items": [], "TotalRecordCount": 0})
        elif path == "/Genres":
            self._json({"Items": [], "TotalRecordCount": 0})
        elif path == "/Artists/AlbumArtists":
            self._json({"Items": [], "TotalRecordCount": 0})
        elif re.match(r"^/Audio/track[12]/stream$", path):
            data = AUDIO_1 if "track1" in path else AUDIO_2
            range_header = self.headers.get("Range")
            ctype = "audio/mpeg"
            if range_header:
                m = re.match(r"bytes=(\d+)-(\d*)", range_header)
                start = int(m.group(1)) if m else 0
                end = int(m.group(2)) if m and m.group(2) else len(data) - 1
                chunk = data[start : end + 1]
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(chunk)))
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                self.wfile.write(chunk)
            else:
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                self.wfile.write(data)
        else:
            self._json({"Items": [], "TotalRecordCount": 0})


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", 9999), Handler) as srv:
        srv.serve_forever()
