#!/usr/bin/env python3
"""
Patch script: scrape Klint Kubiak's Wikipedia page and merge him
into coaching_connections.json as the Las Vegas Raiders current HC.
"""

import json
import os
import re
import sys
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup

API_URL = "https://en.wikipedia.org/w/api.php"
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "NFLCoachingTreeBot/1.0 (Educational project; contact: nyurkov@gmail.com)",
    "Accept": "application/json",
})

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "coaching_connections.json")

SKIP_LINK_WORDS = {
    "coach", "football", "league", "team", "bowl", "season", "stadium",
    "university", "college", "school", "conference", "national", "american",
    "pro bowl", "super bowl", "nfl", "afl", "afc", "nfc", "division",
    "playoff", "draft", "hall of fame",
}


def make_id(name):
    name = name.strip()
    name = re.sub(r"\s*\(.*?\)\s*", "", name)
    name = name.lower()
    name = re.sub(r"[^a-z0-9\s-]", "", name)
    name = re.sub(r"\s+", "-", name)
    return name


def fetch_page_html(page_title):
    params = {
        "action": "parse",
        "page": page_title,
        "prop": "text",
        "format": "json",
        "redirects": 1,
    }
    resp = SESSION.get(API_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if "parse" in data and "text" in data["parse"]:
        return data["parse"]["text"]["*"]
    return None


def extract_link_title(a_tag):
    href = a_tag.get("href", "")
    if "/wiki/" in href:
        after = href.split("/wiki/")[1]
        if ":" in after and not after.startswith("%"):
            return None
        title = unquote(after).replace("_", " ")
        return title
    return None


def is_person_link(link_text):
    if len(link_text.split()) < 2:
        return False
    lower = link_text.lower()
    for skip in SKIP_LINK_WORDS:
        if skip in lower:
            return False
    if re.search(r"\d", link_text):
        return False
    return True


def get_elements_after_heading(html, heading_id_substring):
    pattern = re.compile(
        r'<h([23])\s[^>]*id="[^"]*' + re.escape(heading_id_substring) + r'[^"]*"[^>]*>',
        re.IGNORECASE
    )
    match = pattern.search(html)
    if not match:
        return []
    heading_level = match.group(1)
    start_pos = match.end()
    next_heading = re.compile(r'<h[1-' + heading_level + r'][\s>]', re.IGNORECASE)
    end_match = next_heading.search(html, start_pos)
    end_pos = end_match.start() if end_match else len(html)
    section_html = html[start_pos:end_pos]
    return BeautifulSoup(section_html, "html.parser")


def extract_years_from_context(context_text):
    match = re.search(r"(\d{4})\s*[-–]\s*(\d{4}|present)", context_text, re.IGNORECASE)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    match = re.search(r"\((\d{4})\)", context_text)
    if match:
        return match.group(1)
    return None


def parse_coaching_tree_section(html, coach_name):
    results = []
    section_soup = get_elements_after_heading(html, "Coaching_tree")
    if not section_soup:
        for alt in ["coaching_tree", "Coaching_Tree", "Coaching/executive_tree"]:
            section_soup = get_elements_after_heading(html, alt)
            if section_soup:
                break
    if not section_soup:
        return results

    current_context = "protege"
    for elem in section_soup.find_all(["p", "ul", "ol"]):
        if elem.name == "p":
            p_text = elem.get_text(strip=True).lower()
            if "served under" in p_text or "worked under" in p_text:
                current_context = "mentor"
            elif "assistant" in p_text and ("head coach" in p_text or "become" in p_text):
                current_context = "protege"
            elif "protégé" in p_text or "protege" in p_text:
                current_context = "protege"
            continue

        list_items = elem.find_all("li")
        for li in list_items:
            li_text = li.get_text(strip=True)
            links = li.find_all("a")
            for link in links:
                title = extract_link_title(link)
                if not title:
                    continue
                link_text = link.get_text(strip=True)
                if not is_person_link(link_text):
                    continue
                li_lower = li_text.lower()
                relationship = current_context
                if "served under" in li_lower or "worked under" in li_lower:
                    relationship = "mentor"
                results.append((link_text, title, relationship, li_text[:200]))
                break
    return results


def parse_infobox_career(html):
    """Extract coaching career entries from the infobox table."""
    soup = BeautifulSoup(html, "html.parser")
    career = []
    infobox = soup.find("table", class_="infobox")
    if not infobox:
        return career

    rows = infobox.find_all("tr")
    in_coaching = False
    for row in rows:
        header = row.find("th")
        if header:
            ht = header.get_text(strip=True).lower()
            if "coaching career" in ht or "career history" in ht:
                in_coaching = True
                continue
            elif in_coaching and any(kw in ht for kw in [
                "record", "playing career", "administrative",
                "executive", "front office", "personal info",
            ]):
                in_coaching = False
                continue
        if not in_coaching:
            continue

        cells = row.find_all("td")
        for cell in cells:
            text = cell.get_text(strip=True)
            year_matches = re.findall(r"(\d{4})\s*[-–]\s*(\d{4}|present)", text, re.IGNORECASE)
            if not year_matches:
                single = re.findall(r"(\d{4})", text)
                if single:
                    year_matches = [(single[0], single[0])]
            if year_matches:
                for ys, ye in year_matches:
                    ye_int = 2025 if ye.lower() == "present" else int(ye)
                    team_text = re.split(r"\d{4}", text)[0].strip()
                    team_text = re.sub(r"[()]", "", team_text).strip()
                    career.append({
                        "team": team_text or "Unknown",
                        "year_start": int(ys),
                        "year_end": ye_int,
                    })
    return career


def main():
    # Load existing data
    with open(DATA_PATH, "r") as f:
        data = json.load(f)

    existing_ids = {c["id"] for c in data["coaches"]}
    existing_conns = {(c["source"], c["target"]) for c in data["connections"]}

    klint_id = "klint-kubiak"

    # Remove any stale entry if re-running
    data["coaches"] = [c for c in data["coaches"] if c["id"] != klint_id]
    data["connections"] = [
        c for c in data["connections"]
        if c["source"] != klint_id and c["target"] != klint_id
    ]

    # Add Klint Kubiak as current HC
    data["coaches"].append({
        "id": klint_id,
        "name": "Klint Kubiak",
        "current_team": "Las Vegas Raiders",
        "is_current_hc": True,
    })
    print("Added Klint Kubiak as Las Vegas Raiders HC")

    # Scrape his Wikipedia page
    print("Fetching Klint_Kubiak Wikipedia page...")
    html = fetch_page_html("Klint Kubiak")
    if not html:
        print("ERROR: Could not fetch page. Adding manual connections only.")
        html = None

    new_connections = []

    if html:
        # Parse coaching tree section
        tree_members = parse_coaching_tree_section(html, "Klint Kubiak")
        print(f"Found {len(tree_members)} coaching tree entries")
        for name, page, rel, ctx in tree_members:
            print(f"  {rel}: {name} — {ctx[:80]}")

        for linked_name, linked_page, relationship, context in tree_members:
            linked_id = make_id(linked_name)
            if relationship == "mentor":
                src, tgt = linked_id, klint_id
            else:
                src, tgt = klint_id, linked_id
            years = extract_years_from_context(context)
            key = (src, tgt)
            rev = (tgt, src)
            if key not in existing_conns and rev not in existing_conns:
                new_connections.append({
                    "source": src,
                    "target": tgt,
                    "type": "coaching_tree",
                    "years": years,
                    "context": context[:300] if context else None,
                })
                existing_conns.add(key)
            # Ensure the linked coach exists
            if linked_id not in existing_ids:
                data["coaches"].append({
                    "id": linked_id,
                    "name": linked_name,
                    "current_team": None,
                    "is_current_hc": False,
                })
                existing_ids.add(linked_id)

        # Also parse infobox for career history to find overlaps
        career = parse_infobox_career(html)
        if career:
            print(f"Found {len(career)} career entries in infobox")
            for entry in career:
                print(f"  {entry['team']} ({entry['year_start']}-{entry['year_end']})")

    # Add known manual connections if not already present:
    # Klint is son of Gary Kubiak (well-known coaching tree member)
    manual = [
        ("gary-kubiak", klint_id, "coaching_tree", None,
         "Son and coaching protege of Gary Kubiak"),
    ]
    for src, tgt, ctype, years, ctx in manual:
        key = (src, tgt)
        rev = (tgt, src)
        if key not in existing_conns and rev not in existing_conns:
            new_connections.append({
                "source": src,
                "target": tgt,
                "type": ctype,
                "years": years,
                "context": ctx,
            })
            existing_conns.add(key)

    data["connections"].extend(new_connections)
    print(f"\nAdded {len(new_connections)} new connections")

    # Save
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    total_hcs = sum(1 for c in data["coaches"] if c.get("is_current_hc"))
    print(f"\nDone! Total coaches: {len(data['coaches'])}, connections: {len(data['connections'])}, current HCs: {total_hcs}")


if __name__ == "__main__":
    main()
