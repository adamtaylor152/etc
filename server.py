#!/usr/bin/env python3
"""etc. website: serves public/ and takes bookings at POST /api/bookings. Python stdlib only.

Env:
  PORT              default 8080
  DATA_DIR          where bookings.db lives (mount a volume here), default ./data
  GOOGLE_MAPS_KEY   browser key for address autocomplete, served as /config.js
  OWNER_EMAIL       where new-booking notices go
  MAIL_FROM         From: address for all mail (default OWNER_EMAIL)
  ETRANSFER_EMAIL   shown to customers who pick e-Transfer (default OWNER_EMAIL)
  PRIMARY_HOST      main domain (etccrew.ca); requests for any other host are redirected there
  HELP_EMAIL        public contact address; customers' replies go here (default help@etccrew.ca)
  SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, SMTP_TLS (starttls|ssl|none, default starttls)
  WEATHER_USER_AGENT  sent to MET Norway, which asks for an app name + contact, e.g. "etc-website/1.0 you@domain"
Bookings are always saved to SQLite first; email is best-effort, so a mail outage never loses a booking.
"""
import json
import logging
import os
import re
import smtplib
import sqlite3
import threading
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE / "public"
DATA_DIR = Path(os.environ.get("DATA_DIR", HERE / "data"))
DB = DATA_DIR / "bookings.db"
PORT = int(os.environ.get("PORT", "8080"))
MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY", "")
OWNER_EMAIL = os.environ.get("OWNER_EMAIL", "")
MAIL_FROM = os.environ.get("MAIL_FROM", OWNER_EMAIL)
ETRANSFER_EMAIL = os.environ.get("ETRANSFER_EMAIL", OWNER_EMAIL)
PHONE = "403-656-8200"
PRIMARY_HOST = os.environ.get("PRIMARY_HOST", "")  # e.g. etccrew.ca: every other domain 301s here
HELP_EMAIL = os.environ.get("HELP_EMAIL", "help@etccrew.ca")  # public contact; customer replies go here

SERVICES = {
    "Snow shovelling", "Commercial snow removal", "Roof snow removal",
    "Bin cleaning", "Window cleaning", "Leaf & yard clutter removal", "Trash & junk removal",
    "Driveway / concrete washing", "Deck & fence cleaning", "House & siding wash",
    "Rust stain removal", "Building washing", "Fence repair", "Something else",
}
PLANS = {"One-time visit", "Every snowfall"}
PAYMENTS = {"Cash", "e-Transfer"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CTRL = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")  # everything but \n
MAX_BODY = 16_384

log = logging.getLogger("etc")


# ---------- validation ----------
def text(d, key, limit, required=False, multiline=False):
    v = d.get(key, "")
    if not isinstance(v, str):
        raise ValueError(f"{key} must be text")
    v = CTRL.sub("", v).strip()
    if not multiline:
        v = " ".join(v.split())
    if required and not v:
        raise ValueError(f"{key} is required")
    if len(v) > limit:
        raise ValueError(f"{key} is too long")
    return v


def validate(d):
    b = {
        "name": text(d, "name", 100, required=True),
        "email": text(d, "email", 200, required=True),
        "phone": text(d, "phone", 40),
        "address": text(d, "address", 300, required=True),
        "access": text(d, "access", 300),
        "notes": text(d, "notes", 2000, multiline=True),
        "plan": text(d, "plan", 40),
        "payment": text(d, "payment", 20, required=True),
        "date": text(d, "date", 10),
    }
    if not EMAIL_RE.match(b["email"]):
        raise ValueError("email doesn't look right")
    services = d.get("services")
    if not isinstance(services, list) or not services or not all(s in SERVICES for s in services):
        raise ValueError("pick at least one service")
    b["services"] = list(dict.fromkeys(services))
    if b["payment"] not in PAYMENTS:
        raise ValueError("payment must be cash or e-Transfer")
    shovel = "Snow shovelling" in b["services"]
    if shovel and b["plan"] not in PLANS:
        raise ValueError("pick one-time or every snowfall")
    if not shovel:
        b["plan"] = ""
    b["icemelt"] = bool(shovel and d.get("icemelt") is True)
    if b["date"]:
        try:
            day = date.fromisoformat(b["date"])
        except ValueError:
            raise ValueError("date doesn't look right") from None
        if day < date.today() - timedelta(days=1):  # 1-day slack for timezones
            raise ValueError("date is in the past")
    b["estimate"] = estimate(b)
    return b


def estimate(b):
    # Prices are tax included. Only shovelling has a fixed price; everything else is quoted.
    quoted = [s for s in b["services"] if s != "Snow shovelling"]
    if "Snow shovelling" not in b["services"]:
        return "Quote"
    base = 30 if b["plan"] == "Every snowfall" else 35  # every-snowfall plan gets $5 off
    money = f"${base + (5 if b['icemelt'] else 0)}" + (" / snowfall" if b["plan"] == "Every snowfall" else "")
    return money + (" + quote" if quoted else "")


def service_lines(b):
    out = []
    for s in b["services"]:
        if s == "Snow shovelling":
            s += f" ({b['plan']}{', + ice melt' if b['icemelt'] else ''})"
        out.append(s)
    return out


# ---------- storage ----------
def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
            phone TEXT, address TEXT NOT NULL, access TEXT, services TEXT NOT NULL, plan TEXT,
            icemelt INTEGER NOT NULL, date TEXT, notes TEXT, payment TEXT NOT NULL, estimate TEXT NOT NULL)""")


def save(b):
    with sqlite3.connect(DB) as c:
        cur = c.execute(
            "INSERT INTO bookings (created_at,name,email,phone,address,access,services,plan,icemelt,date,notes,payment,estimate)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"), b["name"], b["email"], b["phone"],
             b["address"], b["access"], json.dumps(b["services"]), b["plan"], int(b["icemelt"]),
             b["date"], b["notes"], b["payment"], b["estimate"]))
        return cur.lastrowid


# ---------- email ----------
def send(to, subject, body, reply_to=""):
    if not (os.environ.get("SMTP_HOST") and MAIL_FROM and to):
        log.info("mail not configured, skipped: %s -> %s", subject, to)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = MAIL_FROM, to, subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)  # plain text only: user input is never rendered as HTML
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587"))
    tls = os.environ.get("SMTP_TLS", "starttls")
    with (smtplib.SMTP_SSL if tls == "ssl" else smtplib.SMTP)(host, port, timeout=20) as s:
        if tls == "starttls":
            s.starttls()
        if os.environ.get("SMTP_USER"):
            s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
        s.send_message(msg)


def notify(bid, b):
    when = b["date"] or ("after every snowfall" if b["plan"] == "Every snowfall" else "as soon as possible")
    details = "\n".join(filter(None, [
        f"Name: {b['name']}", f"Email: {b['email']}", b["phone"] and f"Phone: {b['phone']}",
        f"Address: {b['address']}", b["access"] and f"Access: {b['access']}",
        "Services:\n" + "\n".join(f"  - {s}" for s in service_lines(b)),
        f"When: {when}", b["notes"] and f"Notes: {b['notes']}",
        f"Payment: {b['payment']} (after the job)", f"Estimate (tax incl.): {b['estimate']}",
    ]))
    pay = (f"You chose e-Transfer. After the job, send it to {ETRANSFER_EMAIL}."
           if b["payment"] == "e-Transfer" and ETRANSFER_EMAIL else
           "You chose cash. Just pay the crew when we're done.")
    try:
        send(OWNER_EMAIL, f"New booking #{bid}: {b['name']}, {', '.join(b['services'])}", details, reply_to=b["email"])
    except Exception:
        log.exception("owner email failed for booking %s", bid)
    try:
        send(b["email"], "We got your booking. Thanks from Silas & etc.!",
             f"Hi {b['name']},\n\nThanks for booking with etc.! Silas will confirm a time with you shortly.\n\n"
             f"{details}\n\n{pay}\n\nWe'll email you before & after photos when the job is done.\n\nQuestions? Call {PHONE} or email {HELP_EMAIL}.\n\n"
             "Every job helps Silas save for electrician school. Thank you!\n- Silas & the etc. crew",
             reply_to=HELP_EMAIL)
    except Exception:
        log.exception("customer email failed for booking %s", bid)


# ---------- snow forecast ----------
# MET Norway: free, no key, commercial use OK (credit "MET Norway", CC BY 4.0). Calgary, ~10 days.
WEATHER_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=51.0447&lon=-114.0719"
WEATHER_TTL = 1800
_forecast, _forecast_lock = {"at": 0.0, "body": None}, threading.Lock()


def trim_forecast(raw):
    """Non-overlapping periods: hourly near-term, 6-hourly later. [{t, h, s(symbol), p(mm water)}]"""
    out, covered = [], None
    for e in raw["properties"]["timeseries"]:
        t = datetime.fromisoformat(e["time"])
        if covered and t < covered:
            continue
        for key, hrs in (("next_1_hours", 1), ("next_6_hours", 6)):
            if key in e["data"]:
                d = e["data"][key]
                out.append({"t": e["time"], "h": hrs, "s": d["summary"]["symbol_code"],
                            "p": d.get("details", {}).get("precipitation_amount", 0)})
                covered = t + timedelta(hours=hrs)
                break
    return out


def forecast():
    # ponytail: lock is held during the fetch, so concurrent visitors wait on one upstream call. Fine at this traffic.
    with _forecast_lock:
        if _forecast["body"] and time.time() - _forecast["at"] < WEATHER_TTL:
            return _forecast["body"]
        try:
            ua = os.environ.get("WEATHER_USER_AGENT", "etc-website/1.0")
            with urllib.request.urlopen(urllib.request.Request(WEATHER_URL, headers={"User-Agent": ua}), timeout=10) as r:
                _forecast.update(at=time.time(), body=json.dumps(trim_forecast(json.load(r))).encode())
        except Exception:
            log.exception("forecast fetch failed")
            if not _forecast["body"]:
                raise
            _forecast["at"] = time.time() - WEATHER_TTL + 300  # serve stale, retry in 5 min
        return _forecast["body"]


# ---------- rate limit ----------
# ponytail: in-memory, per process, resets on restart. Fine for one container; use Redis if this ever scales out.
_hits, _hits_lock = {}, threading.Lock()


def limited(ip, limit=5, window=600):
    now = time.time()
    with _hits_lock:
        recent = [t for t in _hits.get(ip, []) if now - t < window]
        _hits[ip] = recent + [now]
        return len(recent) >= limit


# ---------- http ----------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(PUBLIC), **kw)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)

    def reply(self, code, obj=None, body=None, ctype="application/json"):
        body = body if body is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            return self.reply(200, {"ok": True})
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        if PRIMARY_HOST and host != PRIMARY_HOST:  # etcyyc.com, www.etccrew.ca, ... -> https://etccrew.ca
            self.send_response(301)
            self.send_header("Location", f"https://{PRIMARY_HOST}{self.path}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/api/forecast":
            try:
                return self.reply(200, body=forecast())
            except Exception:
                return self.reply(502, {"error": "forecast unavailable"})
        if path == "/config.js":
            return self.reply(200, body=f"window.ETC_MAPS_KEY = {json.dumps(MAPS_KEY)};\n".encode(),
                              ctype="application/javascript")
        return super().do_GET()

    def client_ip(self):
        # Behind Coolify's proxy the real client is the LAST X-Forwarded-For hop (earlier hops are client-supplied).
        fwd = self.headers.get("X-Forwarded-For")
        return fwd.split(",")[-1].strip() if fwd else self.client_address[0]

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/bookings":
            return self.send_error(404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if not 0 < n <= MAX_BODY:
            return self.reply(413, {"error": "request too large"})
        try:
            data = json.loads(self.rfile.read(n))
            assert isinstance(data, dict)
        except Exception:
            return self.reply(400, {"error": "bad request"})
        if data.get("website"):  # honeypot field humans never see; pretend it worked
            return self.reply(201, {"ok": True})
        if limited(self.client_ip()):
            return self.reply(429, {"error": f"Too many bookings from here. Please call {PHONE}."})
        try:
            b = validate(data)
        except ValueError as e:
            return self.reply(400, {"error": str(e).capitalize() + "."})
        bid = save(b)
        log.info("booking %s saved", bid)
        threading.Thread(target=notify, args=(bid, b), daemon=True).start()
        self.reply(201, {"ok": True, "id": bid, "estimate": b["estimate"]})


def make_server(port=PORT):
    init_db()
    return ThreadingHTTPServer(("0.0.0.0", port), Handler)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    srv = make_server()
    log.info("etc. listening on :%s (data: %s, maps key: %s, smtp: %s)", PORT, DATA_DIR,
             "set" if MAPS_KEY else "missing", os.environ.get("SMTP_HOST") or "off")
    srv.serve_forever()
