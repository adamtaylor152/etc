"""Smoke test for server.py: python3 tests/test_server.py"""
import io
import itertools
import json
import os
import sqlite3
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["GOOGLE_MAPS_KEY"] = "test-key"
os.environ.pop("SMTP_HOST", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

srv = server.make_server(0)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_address[1]}"


_ips = (f"10.0.0.{n}" for n in itertools.count(1))


def post(body, ip=None):
    ip = ip or next(_ips)  # fresh IP per call so the rate limiter only bites where we test it
    req = urllib.request.Request(BASE + "/api/bookings", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "X-Forwarded-For": ip})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def rows():
    with sqlite3.connect(server.DB) as c:
        return c.execute("select name, services, estimate from bookings").fetchall()


good = {"name": "Test Neighbour", "email": "test@example.com", "address": "800 Macleod Trl SE, Calgary",
        "services": ["Snow shovelling", "Window cleaning"], "plan": "Every snowfall", "icemelt": True,
        "payment": "e-Transfer", "notes": "line one\nline two"}

assert urllib.request.urlopen(BASE + "/healthz").status == 200
assert b'"test-key"' in urllib.request.urlopen(BASE + "/config.js").read()
assert b"Silas" in urllib.request.urlopen(BASE + "/").read()

code, body = post(good)
assert code == 201 and body["estimate"] == "$35 / snowfall + quote", body
assert rows() == [("Test Neighbour", '["Snow shovelling", "Window cleaning"]', "$35 / snowfall + quote")]

assert post({**good, "email": "nope"})[0] == 400
assert post({**good, "payment": "Bitcoin"})[0] == 400
assert post({**good, "services": ["Hacking"]})[0] == 400
assert post({**good, "services": []})[0] == 400
assert post({**good, "date": "2001-01-01"})[0] == 400
assert post({**good, "name": "x" * 101})[0] == 400
assert post({**good, "plan": "One-time visit", "services": ["Snow shovelling"]})[1]["estimate"] == "$40"  # one-time: 35 + 5 ice melt
code, body = post({**good, "services": ["Fence repair"]})
assert code == 201 and body["estimate"] == "Quote", body

before = len(rows())
assert post({**good, "website": "spam.example"})[0] == 201  # honeypot: fake success
assert len(rows()) == before

for _ in range(6):
    code, _ = post(good, ip="9.9.9.9")
assert code == 429

# Email path: fake SMTP records what would be sent.
sent = []


class FakeSMTP:
    def __init__(self, host, port, timeout): sent.append(("connect", host, port))
    def __enter__(self): return self
    def __exit__(self, *a): pass
    def starttls(self): sent.append(("tls",))
    def login(self, u, p): sent.append(("login", u))
    def send_message(self, m): sent.append(("msg", m))


server.smtplib.SMTP = FakeSMTP
os.environ.update(SMTP_HOST="smtp-relay.brevo.com", SMTP_USER="u@example.com", SMTP_PASSWORD="k")
server.MAIL_FROM, server.OWNER_EMAIL, server.ETRANSFER_EMAIL = "etc. <bookings@example.com>", "owner@example.com", "pay@example.com"
server.notify(7, server.validate(good))
msgs = [x[1] for x in sent if x[0] == "msg"]
assert ("connect", "smtp-relay.brevo.com", 587) in sent and ("tls",) in sent and ("login", "u@example.com") in sent
assert [m["To"] for m in msgs] == ["owner@example.com", "test@example.com"]
assert msgs[0]["Reply-To"] == "test@example.com" and "#7" in msgs[0]["Subject"]
assert "pay@example.com" in msgs[1].get_content() and "Silas" in msgs[1].get_content()
assert msgs[1]["Reply-To"] == "help@etccrew.ca" and "help@etccrew.ca" in msgs[1].get_content()

# Forecast: hourly then 6-hourly periods, no double counting, served from cache.
fake = {"properties": {"timeseries": [
    {"time": "2026-12-01T00:00:00Z", "data": {"next_1_hours": {"summary": {"symbol_code": "lightsnow"}, "details": {"precipitation_amount": 0.4}},
                                               "next_6_hours": {"summary": {"symbol_code": "snow"}, "details": {"precipitation_amount": 3}}}},
    {"time": "2026-12-01T01:00:00Z", "data": {"next_6_hours": {"summary": {"symbol_code": "snow"}, "details": {"precipitation_amount": 2}}}},
    {"time": "2026-12-01T06:00:00Z", "data": {"next_6_hours": {"summary": {"symbol_code": "cloudy"}, "details": {"precipitation_amount": 0}}}},
    {"time": "2026-12-01T07:00:00Z", "data": {"next_6_hours": {"summary": {"symbol_code": "snow"}, "details": {"precipitation_amount": 9}}}},
    {"time": "2026-12-01T12:00:00Z", "data": {"instant": {}}},
]}}
assert server.trim_forecast(fake) == [
    {"t": "2026-12-01T00:00:00Z", "h": 1, "s": "lightsnow", "p": 0.4},
    {"t": "2026-12-01T01:00:00Z", "h": 6, "s": "snow", "p": 2},
    {"t": "2026-12-01T07:00:00Z", "h": 6, "s": "snow", "p": 9},
]


class FakeResp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): pass


calls = []
real_urlopen = urllib.request.urlopen  # same module the test uses, so only intercept MET Norway calls


def fake_urlopen(req, *a, **kw):
    if getattr(req, "full_url", "").startswith("https://api.met.no/"):
        calls.append(req.get_header("User-agent"))
        return FakeResp(json.dumps(fake).encode())
    return real_urlopen(req, *a, **kw)


urllib.request.urlopen = fake_urlopen
for _ in range(2):
    assert json.load(urllib.request.urlopen(BASE + "/api/forecast"))[2]["p"] == 9
assert calls == ["etc-website/1.0"]  # second request came from cache

# Other domains redirect to the primary one; health check never does.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw): return None


server.PRIMARY_HOST = "etccrew.ca"
opener = urllib.request.build_opener(NoRedirect)
try:
    opener.open(urllib.request.Request(BASE + "/book.html?plan=every", headers={"Host": "www.etcyyc.com"}))
    raise AssertionError("expected a redirect")
except urllib.error.HTTPError as e:
    assert e.code == 301 and e.headers["Location"] == "https://etccrew.ca/book.html?plan=every", (e.code, e.headers["Location"])
assert opener.open(urllib.request.Request(BASE + "/", headers={"Host": "etccrew.ca"})).status == 200
assert opener.open(urllib.request.Request(BASE + "/healthz", headers={"Host": "127.0.0.1"})).status == 200
server.PRIMARY_HOST = ""

print("ok")
