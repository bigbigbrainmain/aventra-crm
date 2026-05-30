"""
0_suggest_searches.py — Suggest random industry + city combos to search for leads

Reads existing leads from the sheet to avoid suggesting combos already done.

Usage:
    python 0_suggest_searches.py              # show 10 random suggestions
    python 0_suggest_searches.py --count 20
    python 0_suggest_searches.py --city Manchester    # fix city, vary industry
    python 0_suggest_searches.py --industry plumber   # fix industry, vary city
    python 0_suggest_searches.py --no-sheet           # skip sheet check, show all

Then run the suggested combo with:
    python 1_find_leads.py --type "plumber" --city "Manchester"
"""

import argparse
import os
import random

from dotenv import load_dotenv

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

# ── Industries ────────────────────────────────────────────────────────────────

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

# ── UK Cities & Towns ─────────────────────────────────────────────────────────

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

# ── Sheet check ───────────────────────────────────────────────────────────────

def get_done_combos() -> set[tuple[str, str]]:
    """Return (industry, city) pairs already in the sheet (case-insensitive)."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        CREDENTIALS_PATH = os.path.join(ROOT_DIR, "credentials.json")
        SCOPES = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        client = gspread.service_account(filename=CREDENTIALS_PATH)
        sheet = client.open_by_key("1EclGQA4RZMrAKcYHfYclZnA_NzuzgKmPCqhq0cYA3NE").worksheet("Leads Pipeline")
        rows = sheet.get_all_values()
        if len(rows) <= 1:
            return set()
        # Col 3 = Industry, Col 4 = City (1-based)
        done = set()
        for row in rows[1:]:
            if len(row) >= 4:
                industry = row[2].strip().lower()
                city = row[3].strip().lower()
                if industry and city:
                    done.add((industry, city))
        return done
    except Exception:
        return set()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Suggest industry + city search combos")
    parser.add_argument("--count", type=int, default=10, help="Number of suggestions (default 10)")
    parser.add_argument("--city", default="", help="Fix a city and vary the industry")
    parser.add_argument("--industry", default="", help="Fix an industry and vary the city")
    parser.add_argument("--no-sheet", action="store_true", help="Skip sheet check")
    args = parser.parse_args()

    industries = [args.industry] if args.industry else INDUSTRIES
    cities = [args.city] if args.city else CITIES

    done_combos: set[tuple[str, str]] = set()
    if not args.no_sheet:
        print("Checking sheet for already-searched combos...", end=" ", flush=True)
        done_combos = get_done_combos()
        print(f"{len(done_combos)} found.\n")

    # Build all possible combos and shuffle
    all_combos = [(i, c) for i in industries for c in cities]
    random.shuffle(all_combos)

    suggestions = []
    for industry, city in all_combos:
        if (industry.lower(), city.lower()) not in done_combos:
            suggestions.append((industry, city))
        if len(suggestions) >= args.count:
            break

    if not suggestions:
        print("No new combos found — you've covered everything!")
        return

    print(f"Suggested searches ({len(suggestions)}):\n")
    for industry, city in suggestions:
        print(f"  python 1_find_leads.py --type \"{industry}\" --city \"{city}\"")

    print()


if __name__ == "__main__":
    main()
