"""Branded HTML emails for etc. Email-client-safe: tables, inline styles, no external CSS or JS.

Every piece of user input goes through esc() (or quote() inside URLs). Nothing typed into the
booking form is ever inserted as raw HTML.
"""
from html import escape
from urllib.parse import quote, quote_plus

NAVY, BLUE, SKY, INK_SOFT, LINE, TINT = "#14213d", "#1d6fd8", "#7cb8ff", "#4a5672", "#dfe5ef", "#f4f7fc"
FONT = "'Rubik','Helvetica Neue',Helvetica,Arial,sans-serif"
BODY_FONT = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"


def esc(s):
    return escape(str(s or ""), quote=True)


def nl2br(s):
    return esc(s).replace("\n", "<br>")


def _page(title, preheader, inner):
    """Outer shell: grey canvas, centred 600px card, hidden preheader shown in inbox previews."""
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  body {{ margin:0; padding:0; }}
  a {{ color:{BLUE}; }}
  @media (max-width:620px) {{
    .px {{ padding-left:22px !important; padding-right:22px !important; }}
    .h1 {{ font-size:26px !important; }}
    .stack {{ display:block !important; width:100% !important; }}
    .btn-cell {{ padding:0 0 10px 0 !important; }}
    .stack-pad {{ padding:14px 0 0 0 !important; text-align:left !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:#eef2f8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef2f8;">{esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f8;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid {LINE};">
{inner}
</table>
</td></tr></table>
</body></html>"""


def _header(right_text):
    return f"""<tr><td style="background:{NAVY};padding:20px 32px;" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:{FONT};font-size:30px;font-weight:700;letter-spacing:-0.5px;color:#ffffff;line-height:1;">etc<span style="color:{SKY};">.</span></td>
<td align="right" style="font-family:{BODY_FONT};font-size:13px;color:#b9c3d8;">{right_text}</td>
</tr></table></td></tr>"""


def _rows(pairs):
    """Label / value rows for a summary card. Values are already-escaped HTML."""
    out = []
    for i, (label, value) in enumerate(pairs):
        border = "" if i == 0 else f"border-top:1px solid {LINE};"
        out.append(f"""<tr>
<td valign="top" style="{border}padding:12px 0;width:120px;font-family:{BODY_FONT};font-size:13px;color:{INK_SOFT};">{esc(label)}</td>
<td valign="top" style="{border}padding:12px 0;font-family:{BODY_FONT};font-size:15px;color:{NAVY};font-weight:600;">{value}</td>
</tr>""")
    return "".join(out)


def _button(href, label, bg=BLUE, fg="#ffffff", border=None):
    border = border or bg
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="{bg}" style="border-radius:999px;border:2px solid {border};">
<a href="{esc(href)}" style="display:inline-block;padding:12px 22px;font-family:{BODY_FONT};font-size:15px;font-weight:600;color:{fg};text-decoration:none;border-radius:999px;">{esc(label)}</a>
</td></tr></table>"""


def _services_html(lines):
    return "<br>".join(esc(s) for s in lines)


def _first_name(name):
    return (name or "").strip().split(" ")[0] or "neighbour"


# ---------------------------------------------------------------------------
def customer_email(b, bid, *, services, when, site, phone, help_email, etransfer_email):
    first = _first_name(b["name"])
    tel = "tel:+1" + "".join(c for c in phone if c.isdigit())
    if b["payment"] == "e-Transfer" and etransfer_email:
        pay_title = "Paying by e-Transfer"
        pay_body = (f"After the job, send your e-Transfer to <a href=\"mailto:{esc(etransfer_email)}\" "
                    f"style=\"color:{BLUE};font-weight:600;\">{esc(etransfer_email)}</a>. Cash works too if that's easier on the day.")
    else:
        pay_title = "Paying with cash"
        pay_body = "Just pay the crew when we're done. No need to be home; leave it somewhere safe and let us know where."

    steps = [
        ("Silas confirms a time", "He'll reach out shortly to lock it in." if b["plan"] != "Every snowfall"
         else "You're on the list. We'll come after every snowfall, no need to call."),
        ("We get it done", "Driveway, walk and steps cleared, with ice melt if you added it."
         if "Snow shovelling" in b["services"] else "We'll take care of everything you booked."),
        ("Before & after photos", "We'll email you photos of the finished job so you can see the difference."),
    ]
    steps_html = "".join(f"""<tr>
<td valign="top" style="padding:0 14px 16px 0;width:34px;">
<div style="width:34px;height:34px;line-height:34px;border-radius:50%;background:{NAVY};color:#ffffff;text-align:center;font-family:{FONT};font-weight:700;font-size:15px;">{i}</div></td>
<td valign="top" style="padding:0 0 16px 0;font-family:{BODY_FONT};">
<div style="font-size:15px;font-weight:600;color:{NAVY};">{esc(t)}</div>
<div style="font-size:14px;color:{INK_SOFT};line-height:1.5;">{esc(d)}</div></td></tr>""" for i, (t, d) in enumerate(steps, 1))

    summary = _rows([
        ("Services", _services_html(services)),
        ("Address", esc(b["address"]) + (f"<br><span style=\"font-weight:400;color:{INK_SOFT};font-size:13px;\">{esc(b['access'])}</span>" if b["access"] else "")),
        ("When", esc(when[:1].upper() + when[1:])),
        ("Payment", esc(b["payment"]) + " <span style=\"font-weight:400;color:#4a5672;\">(after the job)</span>"),
        ("Estimate", f"<span style=\"font-family:{FONT};font-size:20px;color:{BLUE};\">{esc(b['estimate'])}</span>"
                     f"<br><span style=\"font-weight:400;color:{INK_SOFT};font-size:12px;\">Tax included</span>"),
    ] + ([("Your notes", nl2br(b["notes"]))] if b["notes"] else []))

    inner = f"""{_header("Snow shovelling &amp; odd jobs")}
<tr><td style="padding:0;"><img src="{esc(site)}/img/email-hero.jpg" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>
<tr><td class="px" style="padding:32px 40px 8px;">
<div style="font-family:{BODY_FONT};font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:{BLUE};">Booking received &middot; #{bid}</div>
<h1 class="h1" style="margin:10px 0 12px;font-family:{FONT};font-size:30px;line-height:1.15;font-weight:700;color:{NAVY};">Thanks, {esc(first)}! Your booking is in.</h1>
<p style="margin:0 0 22px;font-family:{BODY_FONT};font-size:16px;line-height:1.6;color:{INK_SOFT};">Silas got your request and will be in touch shortly to lock in a time. Here's what you booked:</p>
</td></tr>
<tr><td class="px" style="padding:0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{TINT};border-radius:14px;">
<tr><td style="padding:8px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{summary}</table></td></tr>
</table></td></tr>
<tr><td class="px" style="padding:30px 40px 6px;">
<div style="font-family:{FONT};font-size:19px;font-weight:700;color:{NAVY};margin-bottom:16px;">What happens next</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{steps_html}</table>
</td></tr>
<tr><td class="px" style="padding:0 40px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid {LINE};border-left:4px solid {BLUE};border-radius:10px;">
<tr><td style="padding:16px 20px;font-family:{BODY_FONT};">
<div style="font-size:15px;font-weight:600;color:{NAVY};margin-bottom:4px;">{esc(pay_title)}</div>
<div style="font-size:14px;line-height:1.55;color:{INK_SOFT};">{pay_body}</div>
</td></tr></table></td></tr>
<tr><td style="background:{NAVY};padding:28px 40px;" class="px">
<div style="font-family:{FONT};font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">Every job helps Silas get to electrician school.</div>
<p style="margin:8px 0 18px;font-family:{BODY_FONT};font-size:14px;line-height:1.6;color:#b9c3d8;">He's saving every dollar from etc. toward his tuition. Thanks for being part of it. Seriously.</p>
{_button(site + "/#story", "See how close he is", bg=NAVY, fg="#ffffff", border="#ffffff")}
</td></tr>
<tr><td class="px" style="padding:24px 40px 30px;font-family:{BODY_FONT};font-size:13px;line-height:1.7;color:{INK_SOFT};" align="center">
Questions? Call <a href="{esc(tel)}" style="color:{NAVY};font-weight:600;text-decoration:none;">{esc(phone)}</a> or just reply to this email.<br>
<a href="{esc(site)}" style="color:{BLUE};text-decoration:none;font-weight:600;">etccrew.ca</a> &middot; Snow shovelling &amp; odd jobs in Calgary<br>
<span style="color:#9aa5bb;font-size:12px;">You're getting this because you booked a job at etccrew.ca.</span>
</td></tr>"""
    return _page("We got your booking", f"Thanks {first}! Silas will be in touch shortly to lock in a time.", inner)


# ---------------------------------------------------------------------------
def owner_email(b, bid, *, services, when, site):
    maps = "https://www.google.com/maps/search/?api=1&query=" + quote_plus(b["address"])
    reply = "mailto:" + quote(b["email"], safe="@.") + "?subject=" + quote(f"Your etc. booking #{bid}")
    buttons = [(f"mailto", reply, "Email customer")]
    if b["phone"]:
        buttons.insert(0, ("tel", "tel:" + "".join(c for c in b["phone"] if c.isdigit() or c == "+"), "Call " + _first_name(b["name"])))
    buttons.append(("map", maps, "Open in Maps"))
    btn_html = "".join(
        f'<td class="stack btn-cell" style="padding:0 10px 0 0;">'
        f'{_button(href, label, bg=(BLUE if i == 0 else "#ffffff"), fg=("#ffffff" if i == 0 else NAVY), border=(BLUE if i == 0 else LINE))}</td>'
        for i, (_, href, label) in enumerate(buttons))

    rows = _rows([
        ("Services", _services_html(services)),
        ("When", esc(when[:1].upper() + when[1:])),
        ("Address", f'<a href="{esc(maps)}" style="color:{NAVY};">{esc(b["address"])}</a>'),
    ] + ([("Access", esc(b["access"]))] if b["access"] else []) + [
        ("Email", f'<a href="{esc(reply)}" style="color:{BLUE};">{esc(b["email"])}</a>'),
    ] + ([("Phone", esc(b["phone"]))] if b["phone"] else []) + [
        ("Payment", esc(b["payment"])),
    ])

    notes = ""
    if b["notes"]:
        notes = f"""<tr><td class="px" style="padding:0 40px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8e6;border-radius:10px;border:1px solid #f2dca0;">
<tr><td style="padding:14px 18px;font-family:{BODY_FONT};">
<div style="font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#8a6200;margin-bottom:4px;">Customer notes</div>
<div style="font-size:15px;line-height:1.55;color:{NAVY};">{nl2br(b["notes"])}</div>
</td></tr></table></td></tr>"""

    plan_badge = ("Every snowfall" if b["plan"] == "Every snowfall" else "One-time") if "Snow shovelling" in b["services"] else "Quote job"
    inner = f"""{_header(f"New booking &middot; #{bid}")}
<tr><td class="px" style="padding:30px 40px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" class="stack">
<div style="font-family:{BODY_FONT};font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:{BLUE};">New booking &middot; {esc(plan_badge)}</div>
<h1 class="h1" style="margin:8px 0 4px;font-family:{FONT};font-size:30px;line-height:1.15;font-weight:700;color:{NAVY};">{esc(b["name"])}</h1>
<div style="font-family:{BODY_FONT};font-size:15px;color:{INK_SOFT};">{esc(b["address"])}</div>
</td>
<td valign="top" align="right" class="stack stack-pad" style="padding-left:12px;">
<div style="display:inline-block;background:{TINT};border-radius:12px;padding:10px 14px;text-align:center;">
<div style="font-family:{BODY_FONT};font-size:11px;color:{INK_SOFT};text-transform:uppercase;letter-spacing:1px;">Estimate</div>
<div style="font-family:{FONT};font-size:20px;font-weight:700;color:{BLUE};white-space:nowrap;">{esc(b["estimate"])}</div>
</div></td>
</tr></table></td></tr>
<tr><td class="px" style="padding:18px 40px 22px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>{btn_html}</tr></table></td></tr>
<tr><td class="px" style="padding:0 40px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid {LINE};border-radius:14px;">
<tr><td style="padding:6px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table></td></tr>
</table></td></tr>
{notes}
<tr><td class="px" style="padding:0 40px 28px;font-family:{BODY_FONT};font-size:13px;line-height:1.6;color:{INK_SOFT};">
Reply to this email to answer {esc(_first_name(b["name"]))} directly. They've been told Silas will be in touch to confirm a time.
</td></tr>
<tr><td style="background:{TINT};padding:16px 40px;font-family:{BODY_FONT};font-size:12px;color:#9aa5bb;" class="px" align="center">
etc. booking system &middot; <a href="{esc(site)}" style="color:{INK_SOFT};">etccrew.ca</a>
</td></tr>"""
    return _page(f"New booking #{bid}", f"{b['name']} · {', '.join(services)} · {b['estimate']}", inner)
