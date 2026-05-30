"""
2_check_sites.py — Score existing leads' websites and assign priority tiers

Usage:
    python 2_check_sites.py

For each lead in the sheet with an empty Priority column, checks the website
via HTTP and PageSpeed Insights API, then writes Priority and Priority Reason
back to the sheet.

Priority tiers:
    🔴 Priority 1 — no website / broken / unreachable
    🟠 Priority 2 — mobile score < 50, no SSL, or old copyright (pre-2025)
    🟡 Priority 3 — mobile score 50–70, or no mobile viewport
    🟢 Skip        — mobile score > 70, HTTPS, no obvious issues

Requires:
    pip install requests gspread google-auth python-dotenv
    .env file with GOOGLE_API_KEY set
    credentials.json for Google Sheets OAuth (service account)
"""

import os
import re
import socket
import ssl
import time
from datetime import datetime, timezone

import gspread
import requests
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

# ── Config ────────────────────────────────────────────────────────────────────

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
CREDENTIALS_PATH = os.path.join(ROOT_DIR, "credentials.json")
PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
SHEET_NAME = "Freelance Agency CRM"
SHEET_ID = "1EclGQA4RZMrAKcYHfYclZnA_NzuzgKmPCqhq0cYA3NE"
TAB_NAME = "Leads Pipeline"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Column positions (1-based, matching headers in 1_find_leads.py)
COL_BUSINESS_NAME = 2
COL_WEBSITE = 7
COL_PRIORITY = 8
COL_PRIORITY_REASON = 9

CURRENT_YEAR = 2026
OLD_COPYRIGHT_YEAR = CURRENT_YEAR - 2  # 2024 or earlier = stale


# ── Google Sheets ─────────────────────────────────────────────────────────────

def get_sheet():
    client = gspread.service_account(filename=CREDENTIALS_PATH)
    return client.open_by_key(SHEET_ID).worksheet(TAB_NAME)


def get_or_create_skipped_tab(sheet) -> object:
    """Return the Skipped worksheet, creating it with headers if needed."""
    spreadsheet = sheet.spreadsheet  # already opened by key, so this is correct
    try:
        skipped = spreadsheet.worksheet("Skipped")
    except gspread.exceptions.WorksheetNotFound:
        skipped = spreadsheet.add_worksheet(title="Skipped", rows=1000, cols=20)
        # Copy header row from Leads Pipeline
        headers = sheet.row_values(1)
        if headers:
            skipped.append_row(headers)
    return skipped


def move_skips_to_skipped_tab(sheet, skipped_sheet):
    """
    Find all rows in Leads Pipeline with a Skip priority, copy them to the
    Skipped tab, then delete them from Leads Pipeline (bottom-up to keep indices stable).
    """
    all_rows = sheet.get_all_values()
    if len(all_rows) <= 1:
        return 0

    rows_to_move = []
    for i, row in enumerate(all_rows[1:], start=2):
        if len(row) >= COL_PRIORITY and "Skip" in row[COL_PRIORITY - 1]:
            rows_to_move.append((i, row))

    if not rows_to_move:
        return 0

    # Append all rows to Skipped tab in one batch call
    skipped_sheet.append_rows(
        [row for _, row in rows_to_move],
        value_input_option="USER_ENTERED",
        table_range="A1",
    )

    # Delete from Leads Pipeline bottom-up so row numbers stay valid
    for row_number, _ in reversed(rows_to_move):
        sheet.delete_rows(row_number)
        time.sleep(2)  # Sheets write quota: ~60 writes/min

    return len(rows_to_move)


def get_unscored_rows(sheet) -> list[dict]:
    """Return rows that have no Priority set yet (skip header row)."""
    all_rows = sheet.get_all_values()
    if len(all_rows) <= 1:
        return []

    unscored = []
    for i, row in enumerate(all_rows[1:], start=2):  # row_number is 1-based
        # Pad short rows
        while len(row) < COL_PRIORITY:
            row.append("")

        website = row[COL_WEBSITE - 1].strip()
        priority = row[COL_PRIORITY - 1].strip()

        if not priority:  # not yet scored
            unscored.append({
                "row": i,
                "name": row[COL_BUSINESS_NAME - 1].strip(),
                "website": website,
            })

    return unscored


def write_priority(sheet, row_number: int, priority: str, reason: str):
    sheet.update_cell(row_number, COL_PRIORITY, priority)
    sheet.update_cell(row_number, COL_PRIORITY_REASON, reason)


# ── HTTP / site checks ────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; AventraLeadBot/1.0; +https://aventra.co.uk)"
    )
}


def get_ssl_status(hostname: str) -> str:
    """
    Returns 'ok', 'expired', 'invalid', or 'error'.
    Connects directly via ssl module for reliable expiry detection.
    """
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                not_after = datetime.strptime(
                    cert["notAfter"], "%b %d %H:%M:%S %Y %Z"
                ).replace(tzinfo=timezone.utc)
                return "expired" if not_after < datetime.now(timezone.utc) else "ok"
    except ssl.SSLCertVerificationError as e:
        # verify_code 10 = X509_V_ERR_CERT_HAS_EXPIRED
        if getattr(e, "verify_code", None) == 10 or "expired" in str(e).lower():
            return "expired"
        return "invalid"
    except Exception:
        return "error"


def check_site(url: str) -> dict:
    """
    Fetch the URL and return basic signals:
        reachable    bool
        has_ssl      bool   (final URL is https)
        status_code  int
        html         str    (truncated to 50 KB for copyright check)
    """
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    hostname = url.split("://", 1)[-1].split("/")[0]
    ssl_status = get_ssl_status(hostname)

    try:
        resp = requests.get(
            url, timeout=10, headers=HEADERS,
            allow_redirects=True, verify=False,  # verify=False to handle bad certs gracefully
        )
        html = resp.text[:50_000]
        return {
            "reachable": resp.status_code < 400,
            "has_ssl": resp.url.startswith("https://"),
            "ssl_status": ssl_status,
            "status_code": resp.status_code,
            "html": html,
        }
    except requests.RequestException:
        return {
            "reachable": False,
            "has_ssl": False,
            "ssl_status": ssl_status,
            "status_code": 0,
            "html": "",
        }


def has_old_copyright(html: str) -> bool:
    """True if the page contains a copyright year of OLD_COPYRIGHT_YEAR or earlier."""
    # Match © 2019, copyright 2020, (c) 2021, etc.
    matches = re.findall(
        r"(?:©|&copy;|copyright|\(c\))[^\d]{0,30}(\d{4})",
        html,
        flags=re.IGNORECASE,
    )
    if not matches:
        return False
    latest_year = max(int(y) for y in matches)
    return latest_year <= OLD_COPYRIGHT_YEAR


# ── PageSpeed Insights ────────────────────────────────────────────────────────

def get_pagespeed_score(url: str) -> int | None:
    """
    Call PageSpeed Insights (mobile strategy).
    Returns performance score 0–100, or None on API error.
    """
    params = {
        "url": url,
        "key": GOOGLE_API_KEY,
        "strategy": "mobile",
        "category": "performance",
    }
    try:
        resp = requests.get(PAGESPEED_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        score = (
            data.get("lighthouseResult", {})
                .get("categories", {})
                .get("performance", {})
                .get("score")
        )
        if score is not None:
            return int(score * 100)
        return None
    except (requests.RequestException, ValueError):
        return None


# ── Scoring logic ─────────────────────────────────────────────────────────────

def score_lead(website: str) -> tuple[str, str]:
    """
    Return (priority_label, reason_string) for a lead.

    Priority 1 → "🔴 Priority 1"
    Priority 2 → "🟠 Priority 2"
    Priority 3 → "🟡 Priority 3"
    Skip       → "🟢 Skip"
    """
    # No website listed at all
    if not website:
        return "🔴 Priority 1", "No website listed"

    # HTTP check
    site = check_site(website)

    if not site["reachable"]:
        reason = (
            f"Site unreachable (status {site['status_code']})"
            if site["status_code"]
            else "Site unreachable (connection error)"
        )
        return "🔴 Priority 1", reason

    html = site["html"]
    has_ssl = site["has_ssl"]
    ssl_status = site["ssl_status"]
    old_copyright = has_old_copyright(html)

    # Expired SSL cert = browsers show a scary red warning → treat as Priority 1
    if ssl_status == "expired":
        return "🔴 Priority 1", "Expired SSL certificate"

    # PageSpeed mobile score
    score = get_pagespeed_score(website)

    # Build reason flags (used across tiers)
    p2_flags = []
    if score is not None and score < 50:
        p2_flags.append(f"mobile score {score}/100")
    if not has_ssl:
        p2_flags.append("no SSL/HTTPS")
    if old_copyright:
        p2_flags.append(f"old copyright (≤{OLD_COPYRIGHT_YEAR})")

    p3_flags = []
    if score is not None and 50 <= score <= 70:
        p3_flags.append(f"mobile score {score}/100")

    # Tier assignment (P2 beats P3)
    if p2_flags:
        return "🟠 Priority 2", "; ".join(p2_flags)

    if p3_flags:
        return "🟡 Priority 3", "; ".join(p3_flags)

    score_str = f"{score}/100" if score is not None else "unknown"
    return "🟢 Skip", f"Mobile score {score_str}, HTTPS, no obvious issues"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not set in .env")

    print(f"Connecting to Google Sheets '{SHEET_NAME}' → '{TAB_NAME}'...")
    sheet = get_sheet()

    rows = get_unscored_rows(sheet)
    print(f"Found {len(rows)} unscored lead(s).\n")

    # Suppress urllib3 SSL warnings for sites with bad certs
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    if not rows:
        print("Nothing to score.")
    else:
        for i, lead in enumerate(rows, start=1):
            name = lead["name"] or f"Row {lead['row']}"
            website = lead["website"]
            print(f"[{i}/{len(rows)}] {name}")
            print(f"  Website: {website or '(none)'}")

            priority, reason = score_lead(website)
            print(f"  → {priority}  |  {reason}")

            write_priority(sheet, lead["row"], priority, reason)

            # Avoid hammering the Sheets API and PageSpeed quota
            if i < len(rows):
                time.sleep(1)

        print(f"\nDone. {len(rows)} lead(s) scored.")

    print("\nMoving any Skip leads to Skipped tab...")
    skipped_sheet = get_or_create_skipped_tab(sheet)
    moved = move_skips_to_skipped_tab(sheet, skipped_sheet)
    if moved:
        print(f"Moved {moved} Skip lead(s) out of Leads Pipeline.")
    else:
        print("No Skips to move.")


if __name__ == "__main__":
    main()
