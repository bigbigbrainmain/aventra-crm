"""
1_find_leads.py — Find local UK business leads via Google Places API

Usage:
    python 1_find_leads.py                              # auto-pick a random unused industry + city
    python 1_find_leads.py --type "plumber" --city "Manchester"
    python 1_find_leads.py --type "hair salon" --city "Birmingham"
    python 1_find_leads.py --type "restaurant" --city "Leeds"

Requires:
    pip install requests gspread google-auth python-dotenv
    .env file with GOOGLE_API_KEY set
    credentials.json for Google Sheets OAuth (service account)
"""

import argparse
import os
import random
import time
import uuid

import gspread
import requests
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

# Load .env from project root (one level up from scripts/)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
CREDENTIALS_PATH = os.path.join(ROOT_DIR, "credentials.json")
PLACES_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
SHEET_NAME = "Freelance Agency CRM"
SHEET_ID = "1EclGQA4RZMrAKcYHfYclZnA_NzuzgKmPCqhq0cYA3NE"
TAB_NAME = "Leads Pipeline"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# ── Industries & Cities ───────────────────────────────────────────────────────

INDUSTRIES = [
    # Trades
    "plumber", "electrician", "builder", "roofer", "painter decorator",
    "plasterer", "carpenter", "joiner", "locksmith", "glazier",
    "gas engineer", "boiler repair", "damp proofing", "scaffolding",
    "paving contractor", "fencing contractor", "loft conversion",
    # Home & Garden
    "landscaper", "gardener", "tree surgeon", "window cleaner",
    "cleaning service", "carpet cleaning", "pest control", "removal company",
    # Health & Beauty
    "hair salon", "barber", "beauty salon", "nail salon", "tattoo studio",
    "tanning salon", "massage therapist", "physiotherapist", "chiropractor",
    "osteopath", "personal trainer", "yoga studio", "dentist", "optician",
    # Food & Drink
    "restaurant", "cafe", "takeaway", "pizza", "indian restaurant",
    "chinese restaurant", "fish and chips", "pub", "bakery", "butcher",
    # Professional Services
    "accountant", "solicitor", "estate agent", "mortgage broker",
    "financial advisor", "driving instructor", "tutor",
    # Automotive
    "car garage", "mot centre", "tyre fitting", "car valeting",
    "auto electrician", "windscreen repair",
    # Other Local
    "florist", "pet groomer", "dog groomer", "vet", "pharmacy",
    "dry cleaner", "printing service", "photography",
]

CITIES = [
    # Major cities
    "Manchester", "Birmingham", "Leeds", "Sheffield", "Liverpool",
    "Bristol", "Newcastle", "Nottingham", "Leicester", "Coventry",
    "Plymouth", "Southampton", "Portsmouth", "Brighton", "Norwich",
    "Oxford", "Cambridge", "Exeter", "Derby", "Stoke-on-Trent",
    # Scotland / Wales / NI
    "Glasgow", "Edinburgh", "Cardiff", "Swansea", "Belfast",
    # Large towns
    "Reading", "Milton Keynes", "Northampton", "Luton", "Watford",
    "Swindon", "Wolverhampton", "Preston", "Blackpool", "Middlesbrough",
    "Sunderland", "Durham", "Ipswich", "Peterborough", "Gloucester",
    "Cheltenham", "Worcester", "Hereford", "Shrewsbury", "Chester",
    "Warrington", "Bolton", "Wigan", "Burnley", "Blackburn",
    "Huddersfield", "Bradford", "Hull", "York", "Scarborough",
    "Lincoln", "Grimsby", "Doncaster", "Rotherham", "Barnsley",
    "Wakefield", "Harrogate", "Carlisle", "Lancaster", "Kendal",
    "Stockport", "Salford", "Oldham", "Rochdale", "Bury",
    "Guildford", "Crawley", "Worthing", "Eastbourne", "Hastings",
    "Maidstone", "Canterbury", "Folkestone", "Dover", "Thanet",
    "Colchester", "Southend-on-Sea", "Chelmsford", "Basildon",
    "Telford", "Stafford", "Burton-on-Trent", "Tamworth", "Walsall",
    "West Bromwich", "Dudley", "Solihull", "Redditch", "Kidderminster",
    "Torquay", "Paignton", "Barnstaple", "Truro", "Penzance",
    "Yeovil", "Taunton", "Weston-super-Mare", "Bath", "Chippenham",
    "Salisbury", "Basingstoke", "Winchester", "Bournemouth", "Poole",
    "Weymouth", "Dorchester", "Bridgwater",
]


def pick_random_combo(sheet) -> tuple[str, str]:
    """Pick a random industry + city combo not already in the sheet."""
    existing = sheet.get_all_values()
    done: set[tuple[str, str]] = set()
    if len(existing) > 1:
        for row in existing[1:]:
            if len(row) >= 4:
                industry = row[2].strip().lower()
                city = row[3].strip().lower()
                if industry and city:
                    done.add((industry, city))

    all_combos = [(i, c) for i in INDUSTRIES for c in CITIES]
    random.shuffle(all_combos)
    for industry, city in all_combos:
        if (industry.lower(), city.lower()) not in done:
            return industry, city

    raise RuntimeError("No new combos available — you've covered everything!")


# ── Google Sheets ────────────────────────────────────────────────────────────

HEADERS = [
    "ID", "Business Name", "Industry", "City", "Email", "Phone", "Website",
    "Priority", "Priority Reason", "Status", "Date Pitched", "Notes", "Subject", "Email Body", "Calendly Link Sent"
]


def get_sheet():
    client = gspread.service_account(filename=CREDENTIALS_PATH)
    sheet = client.open_by_key(SHEET_ID).worksheet(TAB_NAME)
    # Write headers if sheet is empty
    if not sheet.get_all_values():
        sheet.append_row(HEADERS)
    return sheet


def get_existing_names(sheet):
    """Return a set of business names already in the sheet (column B)."""
    records = sheet.get_all_values()
    if len(records) <= 1:
        return set()
    return {row[1].strip().lower() for row in records[1:] if row}


# ── Google Places API ────────────────────────────────────────────────────────

def find_businesses(business_type: str, city: str) -> list[dict]:
    """
    Call Places Text Search API and paginate through all results.
    Returns up to 60 places (3 pages × 20 results).
    """
    all_results = []
    params = {
        "query": f"{business_type} in {city}",
        "key": GOOGLE_API_KEY,
        "region": "uk",
    }

    while True:
        response = requests.get(PLACES_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        status = data.get("status")
        if status == "ZERO_RESULTS":
            break
        if status == "INVALID_REQUEST":
            # next_page_token not ready — retry once with a longer wait
            if "pagetoken" in params:
                time.sleep(3)
                response = requests.get(PLACES_URL, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()
                status = data.get("status")
                if status != "OK":
                    break
            else:
                break
        if status != "OK":
            print(f"  API error: {status} — {data.get('error_message', '')}")
            break

        results = data.get("results", [])
        all_results.extend(results)
        print(f"  Fetched {len(results)} results (total so far: {len(all_results)})")

        next_page_token = data.get("next_page_token")
        if not next_page_token or len(all_results) >= 60:
            break

        # Google requires a short delay before using next_page_token
        time.sleep(3)
        params = {"pagetoken": next_page_token, "key": GOOGLE_API_KEY}

    return all_results


def get_place_details(place_id: str) -> dict:
    """
    Call Place Details API to fetch website and phone for a single place.
    Returns a dict with 'website' and 'phone' keys (empty strings if missing).
    """
    params = {
        "place_id": place_id,
        "fields": "website,formatted_phone_number",
        "key": GOOGLE_API_KEY,
    }
    try:
        response = requests.get(DETAILS_URL, params=params, timeout=10)
        response.raise_for_status()
        result = response.json().get("result", {})
        return {
            "website": result.get("website", ""),
            "phone": result.get("formatted_phone_number", ""),
        }
    except requests.RequestException:
        return {"website": "", "phone": ""}


def parse_place(place: dict, industry: str, city: str) -> dict:
    """Extract the fields we care about from a Places API result."""
    place_id = place.get("place_id", "")
    details = get_place_details(place_id) if place_id else {"website": "", "phone": ""}

    return {
        "id": str(uuid.uuid4())[:8].upper(),
        "name": place.get("name", ""),
        "industry": industry,
        "city": city,
        "address": place.get("formatted_address", ""),
        "phone": details["phone"],
        "website": details["website"],
        "rating": str(place.get("rating", "")),
        "place_id": place_id,
    }


# ── Sheet writing ────────────────────────────────────────────────────────────

def build_row(lead: dict) -> list:
    """
    Map lead fields to sheet columns in order:
    ID | Business Name | Industry | City | Email | Phone | Website |
    Priority | Priority Reason | Status | Date Pitched | Notes | Calendly Link Sent
    """
    return [
        lead["id"],
        lead["name"],
        lead["industry"],
        lead["city"],
        "",                  # Email — filled by 2.5_find_emails.py
        lead["phone"],
        lead["website"],
        "",                  # Priority — filled by 2_check_sites.py
        "",                  # Priority Reason
        "New",               # Status
        "",                  # Date Pitched
        "",                  # Notes
        "",                  # Subject — filled by 4_draft_emails.py
        "",                  # Email Body — filled by 4_draft_emails.py
        "No",                # Calendly Link Sent
    ]


def push_leads(sheet, leads: list[dict], existing_names: set) -> int:
    """Append only new leads (deduplicated by business name). Returns count added."""
    rows_to_add = []
    for lead in leads:
        if lead["name"].strip().lower() in existing_names:
            print(f"  Skipping duplicate: {lead['name']}")
            continue
        rows_to_add.append(build_row(lead))
        existing_names.add(lead["name"].strip().lower())
        print(f"  Added: {lead['name']}")

    if not rows_to_add:
        return 0

    sheet.append_rows(rows_to_add, value_input_option="USER_ENTERED", table_range="A1")
    return len(rows_to_add)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Find UK business leads via Google Places API")
    parser.add_argument("--type", default="", help='Business type, e.g. "plumber" (auto-picked if omitted)')
    parser.add_argument("--city", default="", help='UK city, e.g. "Manchester" (auto-picked if omitted)')
    args = parser.parse_args()

    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not set in .env")

    # Connect to sheet early so we can check done combos for auto-pick
    print("\nConnecting to Google Sheets...")
    sheet = get_sheet()

    if args.type and args.city:
        business_type = args.type
        city = args.city
    else:
        print("No --type/--city provided — picking a random unused combo from the sheet...")
        business_type, city = pick_random_combo(sheet)
        print(f"  → Chose: '{business_type}' in {city}")

    print(f"\nSearching for '{business_type}' in {city}...")

    # Fetch leads from Places API
    places = find_businesses(business_type, city)
    print(f"\nFound {len(places)} places. Fetching details (website, phone)...")
    leads = []
    for i, place in enumerate(places, start=1):
        lead = parse_place(place, business_type, city)
        print(f"  [{i}/{len(places)}] {lead['name']} → {lead['website'] or '(no website)'}")
        leads.append(lead)
        time.sleep(0.1)  # stay well under the 100 QPS Places limit

    if not leads:
        print("Nothing to push.")
        return

    # Deduplicate against sheet
    print(f"\nSheet: '{SHEET_NAME}' → '{TAB_NAME}'")
    existing_names = get_existing_names(sheet)
    print(f"Sheet already has {len(existing_names)} leads.")

    # Push new leads
    print("\nPushing new leads...")
    added = push_leads(sheet, leads, existing_names)

    print(f"\nDone. {added} new lead(s) added to sheet.")


if __name__ == "__main__":
    main()
