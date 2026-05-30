"""
2.5_find_emails.py — Find email addresses for leads that don't have one yet

Tries strategies in order until an email is found:
  1. Scrape the lead's own website (home + contact/about pages)
  2. 192.com
  3. Hotfrog UK
  4. Cylex UK
  5. FreeIndex.co.uk
  6. Thomson Local
  7. Local.co.uk
  8. Bing search — scrapes top result pages for a visible email

Also writes phone number (col 6) if the sheet row is missing one and the
source returns a phone alongside the email.

Usage:
    python 2.5_find_emails.py              # all priority leads with no email
    python 2.5_find_emails.py --limit 10
    python 2.5_find_emails.py --skip-website   # skip own-site scraping

Requires:
    pip install requests beautifulsoup4 gspread google-auth python-dotenv
    credentials.json for Google Sheets OAuth (service account)
"""

import argparse
import os
import re
import time
import urllib.parse

import gspread
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

CREDENTIALS_PATH = os.path.join(ROOT_DIR, "credentials.json")
SHEET_NAME = "Freelance Agency CRM"
SHEET_ID = "1EclGQA4RZMrAKcYHfYclZnA_NzuzgKmPCqhq0cYA3NE"
TAB_NAME = "Leads Pipeline"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Column positions (1-based, matching 1_find_leads.py)
COL_BUSINESS_NAME = 2
COL_CITY = 4
COL_EMAIL = 5
COL_PHONE = 6
COL_WEBSITE = 7
COL_PRIORITY = 8

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)

PHONE_RE = re.compile(
    r"(?:(?:\+44|0044|0)[\s\-]?(?:\d[\s\-]?){9,10})",
)

EXCLUDED_DOMAINS = {
    "example.com", "sentry.io", "wixpress.com", "squarespace.com",
    "wordpress.com", "google.com", "facebook.com", "instagram.com",
    "twitter.com", "tiktok.com", "linkedin.com", "amazonaws.com",
    "cloudfront.net", "mailchimp.com", "constantcontact.com",
    "godaddy.com", "1and1.com", "ionos.com", "hostgator.com",
    "bluehost.com", "namecheap.com", "domain.com", "yell.com",
    "freeindex.co.uk", "thomsonlocal.com", "bing.com", "microsoft.com",
    "w3.org", "schema.org", "googleapis.com", "gstatic.com",
    "192.com", "hotfrog.co.uk", "cylex-uk.co.uk", "local.co.uk",
}

EXCLUDED_PREFIXES = {
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "webmaster", "postmaster", "bounce", "mailer-daemon",
    "privacy", "legal", "abuse", "spam", "support",
}


# ── Email / phone helpers ─────────────────────────────────────────────────────

def is_valid_email(email: str) -> bool:
    if "@" not in email:
        return False
    domain = email.split("@")[-1].lower()
    prefix = email.split("@")[0].lower()
    if domain in EXCLUDED_DOMAINS:
        return False
    if any(domain.endswith("." + d) for d in EXCLUDED_DOMAINS):
        return False
    if prefix in EXCLUDED_PREFIXES:
        return False
    if any(email.lower().endswith(ext) for ext in (".png", ".jpg", ".gif", ".svg", ".webp")):
        return False
    return True


def extract_emails_from_html(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found = []

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.lower().startswith("mailto:"):
            email = urllib.parse.unquote(href[7:]).split("?")[0].strip().lower()
            if EMAIL_RE.match(email) and is_valid_email(email):
                found.append(email)

    if found:
        return list(dict.fromkeys(found))

    for match in EMAIL_RE.finditer(soup.get_text(separator=" ")):
        email = match.group(0).lower()
        if is_valid_email(email):
            found.append(email)

    return list(dict.fromkeys(found))


def extract_phone_from_html(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        if a["href"].lower().startswith("tel:"):
            phone = a["href"][4:].strip()
            if phone:
                return phone
    match = PHONE_RE.search(soup.get_text(separator=" "))
    return match.group(0).strip() if match else None


def fetch_html(url: str, timeout: int = 10) -> str | None:
    try:
        resp = requests.get(
            url, headers=HEADERS, timeout=timeout,
            allow_redirects=True, verify=False,
        )
        if resp.status_code < 400:
            return resp.text
    except requests.RequestException:
        pass
    return None


def find_listing_and_scrape(search_url: str, link_predicate, base_url: str = "") -> tuple[str | None, str | None]:
    """
    Generic helper: fetch search_url, find first link matching link_predicate,
    fetch that listing page, return (email, phone).
    """
    html = fetch_html(search_url)
    if not html:
        return None, None

    soup = BeautifulSoup(html, "html.parser")
    listing_url = None
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if link_predicate(href):
            listing_url = href if href.startswith("http") else base_url + href
            break

    if not listing_url:
        return None, None

    time.sleep(0.5)
    listing_html = fetch_html(listing_url)
    if not listing_html:
        return None, None

    emails = extract_emails_from_html(listing_html)
    phone = extract_phone_from_html(listing_html)
    return (emails[0] if emails else None), phone


# ── Strategy 1: scrape own website ───────────────────────────────────────────

CONTACT_PATHS = [
    "", "/contact", "/contact-us", "/contactus", "/contact.html",
    "/about", "/about-us", "/aboutus", "/get-in-touch",
    "/reach-us", "/reach-out", "/enquiries", "/enquiry",
]


def scrape_website_for_email(website: str, **_) -> tuple[str | None, str | None]:
    if not website:
        return None, None

    if not website.startswith(("http://", "https://")):
        website = "https://" + website

    parts = urllib.parse.urlparse(website)
    base = f"{parts.scheme}://{parts.netloc}"
    alt_scheme = "http" if parts.scheme == "https" else "https"
    alt_base = f"{alt_scheme}://{parts.netloc}"

    pages_to_try = [website] + [base + p for p in CONTACT_PATHS[1:]]
    if parts.path and parts.path != "/":
        pages_to_try.append(alt_base + parts.path)
    pages_to_try.append(alt_base + "/contact")

    seen = set()
    found_email, found_phone = None, None

    for url in pages_to_try:
        if url in seen:
            continue
        seen.add(url)
        html = fetch_html(url)
        if html:
            if not found_email:
                emails = extract_emails_from_html(html)
                if emails:
                    found_email = emails[0]
            if not found_phone:
                found_phone = extract_phone_from_html(html)
            if found_email:
                break
        time.sleep(0.2)

    return found_email, found_phone


# ── Strategy 2: 192.com ───────────────────────────────────────────────────────

def search_192(name: str, city: str, **_) -> tuple[str | None, str | None]:
    search_url = (
        "https://www.192.com/search/?"
        + urllib.parse.urlencode({"type": "business", "query": f"{name} {city}"})
    )
    return find_listing_and_scrape(
        search_url,
        lambda href: "/atoz/business/" in href or "/business/" in href,
        base_url="https://www.192.com",
    )


# ── Strategy 3: Hotfrog UK ────────────────────────────────────────────────────

def search_hotfrog(name: str, city: str, **_) -> tuple[str | None, str | None]:
    search_url = (
        f"https://www.hotfrog.co.uk/search/uk/"
        f"{urllib.parse.quote_plus(city)}/"
        f"{urllib.parse.quote_plus(name)}"
    )
    return find_listing_and_scrape(
        search_url,
        lambda href: "/company/" in href,
        base_url="https://www.hotfrog.co.uk",
    )


# ── Strategy 4: Cylex UK ──────────────────────────────────────────────────────

def search_cylex(name: str, city: str, **_) -> tuple[str | None, str | None]:
    search_url = (
        "https://www.cylex-uk.co.uk/search.html?"
        + urllib.parse.urlencode({"q": name, "where": city})
    )
    return find_listing_and_scrape(
        search_url,
        lambda href: "/company/" in href and href.endswith(".html"),
        base_url="https://www.cylex-uk.co.uk",
    )


# ── Strategy 5: FreeIndex.co.uk ───────────────────────────────────────────────

def search_freeindex(name: str, city: str, **_) -> tuple[str | None, str | None]:
    search_url = (
        "https://www.freeindex.co.uk/search.htm?"
        + urllib.parse.urlencode({"query": f"{name} {city}"})
    )
    return find_listing_and_scrape(
        search_url,
        lambda href: "/profile/" in href and "~" in href,
        base_url="https://www.freeindex.co.uk",
    )


# ── Strategy 6: Thomson Local ─────────────────────────────────────────────────

def search_thomsonlocal(name: str, city: str, **_) -> tuple[str | None, str | None]:
    search_url = (
        f"https://www.thomsonlocal.com/search/"
        f"{urllib.parse.quote_plus(name)}/"
        f"{urllib.parse.quote_plus(city)}"
    )
    return find_listing_and_scrape(
        search_url,
        lambda href: "/business/" in href,
        base_url="https://www.thomsonlocal.com",
    )


# ── Strategy 7: Local.co.uk ───────────────────────────────────────────────────

def search_local(name: str, city: str, **_) -> tuple[str | None, str | None]:
    search_url = (
        "https://www.local.co.uk/search?"
        + urllib.parse.urlencode({"q": name, "location": city})
    )
    return find_listing_and_scrape(
        search_url,
        lambda href: "/profile/" in href or "/listing/" in href or "/business/" in href,
        base_url="https://www.local.co.uk",
    )


# ── Strategy 8: Bing search ───────────────────────────────────────────────────

def search_bing(name: str, city: str, **_) -> tuple[str | None, str | None]:
    params = {"q": f'"{name}" "{city}" email contact', "mkt": "en-GB", "count": "5"}
    try:
        resp = requests.get(
            "https://www.bing.com/search",
            params=params, headers=HEADERS, timeout=15,
        )
        if resp.status_code != 200:
            return None, None
    except requests.RequestException:
        return None, None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Check snippets directly first
    for match in EMAIL_RE.finditer(soup.get_text(separator=" ")):
        email = match.group(0).lower()
        if is_valid_email(email):
            return email, None

    # Follow top organic result URLs
    result_links = []
    for a in soup.select("li.b_algo h2 a, li.b_algo a.tilk"):
        href = a.get("href", "")
        if href.startswith("http") and "bing.com" not in href and "microsoft.com" not in href:
            result_links.append(href)
        if len(result_links) >= 3:
            break

    for url in result_links:
        time.sleep(0.5)
        html = fetch_html(url)
        if html:
            emails = extract_emails_from_html(html)
            if emails:
                return emails[0], extract_phone_from_html(html)

    return None, None


# ── Strategies list ───────────────────────────────────────────────────────────

STRATEGIES = [
    ("website",       scrape_website_for_email),
    ("192.com",       search_192),
    ("Hotfrog",       search_hotfrog),
    ("Cylex UK",      search_cylex),
    ("FreeIndex",     search_freeindex),
    ("Thomson Local", search_thomsonlocal),
    ("Local.co.uk",   search_local),
    ("Bing search",   search_bing),
]


# ── Google Sheets ─────────────────────────────────────────────────────────────

def get_sheet():
    client = gspread.service_account(filename=CREDENTIALS_PATH)
    return client.open_by_key(SHEET_ID).worksheet(TAB_NAME)


def get_leads_needing_email(sheet) -> list[dict]:
    all_rows = sheet.get_all_values()
    if len(all_rows) <= 1:
        return []

    leads = []
    for i, row in enumerate(all_rows[1:], start=2):
        while len(row) < COL_PRIORITY:
            row.append("")

        priority = row[COL_PRIORITY - 1].strip()
        email = row[COL_EMAIL - 1].strip()

        if not priority or "Skip" in priority:
            continue
        if email:
            continue

        leads.append({
            "row": i,
            "name": row[COL_BUSINESS_NAME - 1].strip(),
            "city": row[COL_CITY - 1].strip(),
            "website": row[COL_WEBSITE - 1].strip(),
            "priority": priority,
            "has_phone": bool(row[COL_PHONE - 1].strip()),
        })

    return leads


def write_results(sheet, row_number: int, email: str, phone: str | None, has_phone: bool):
    sheet.update_cell(row_number, COL_EMAIL, email)
    if phone and not has_phone:
        sheet.update_cell(row_number, COL_PHONE, phone)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Find email addresses for leads")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--skip-website", action="store_true")
    args = parser.parse_args()

    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    print(f"Connecting to Google Sheets '{SHEET_NAME}' -> '{TAB_NAME}'...")
    sheet = get_sheet()

    leads = get_leads_needing_email(sheet)
    if args.limit:
        leads = leads[:args.limit]

    print(f"Found {len(leads)} lead(s) needing an email address.\n")
    if not leads:
        print("Nothing to do.")
        return

    active_strategies = [
        (label, fn) for label, fn in STRATEGIES
        if not (args.skip_website and label == "website")
    ]

    found_count = 0

    for i, lead in enumerate(leads, start=1):
        name = lead["name"]
        city = lead["city"]
        print(f"[{i}/{len(leads)}] {name} ({city})  [{lead['priority']}]")

        email = None
        phone = None

        for label, fn in active_strategies:
            if label == "website" and not lead["website"]:
                continue
            print(f"  Trying {label}...", end=" ", flush=True)
            result_email, result_phone = fn(name=name, city=city, website=lead["website"])
            if result_phone and not phone:
                phone = result_phone
            if result_email:
                email = result_email
                print(f"found: {email}")
                break
            else:
                print("nothing")

        if email:
            write_results(sheet, lead["row"], email, phone, lead["has_phone"])
            found_count += 1
            if phone and not lead["has_phone"]:
                print(f"  Also wrote phone: {phone}")
        else:
            print(f"  No email found")

        if i < len(leads):
            time.sleep(0.5)

    print(f"\nDone. Found emails for {found_count}/{len(leads)} lead(s).")


if __name__ == "__main__":
    main()
