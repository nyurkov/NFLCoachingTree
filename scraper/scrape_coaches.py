#!/usr/bin/env python3
"""
NFL Coaching Tree Scraper
Recursively scrapes Wikipedia via the MediaWiki API to build
a multi-generational coaching tree starting from current NFL head coaches.
"""

import json
import os
import re
import time
from collections import deque
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup, NavigableString

API_URL = "https://en.wikipedia.org/w/api.php"
DELAY = 1.0  # seconds between requests
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "NFLCoachingTreeBot/1.0 (Educational project; contact: nyurkov@gmail.com)",
    "Accept": "application/json",
})

# NFL team colors for current teams
TEAM_COLORS = {
    "Arizona Cardinals": "#97233F",
    "Atlanta Falcons": "#A71930",
    "Baltimore Ravens": "#241773",
    "Buffalo Bills": "#00338D",
    "Carolina Panthers": "#0085CA",
    "Chicago Bears": "#0B162A",
    "Cincinnati Bengals": "#FB4F14",
    "Cleveland Browns": "#311D00",
    "Dallas Cowboys": "#003594",
    "Denver Broncos": "#FB4F14",
    "Detroit Lions": "#0076B6",
    "Green Bay Packers": "#203731",
    "Houston Texans": "#03202F",
    "Indianapolis Colts": "#002C5F",
    "Jacksonville Jaguars": "#006778",
    "Kansas City Chiefs": "#E31837",
    "Las Vegas Raiders": "#000000",
    "Los Angeles Chargers": "#0080C6",
    "Los Angeles Rams": "#003594",
    "Miami Dolphins": "#008E97",
    "Minnesota Vikings": "#4F2683",
    "New England Patriots": "#002244",
    "New Orleans Saints": "#D3BC8D",
    "New York Giants": "#0B2265",
    "New York Jets": "#125740",
    "Philadelphia Eagles": "#004C54",
    "Pittsburgh Steelers": "#FFB612",
    "San Francisco 49ers": "#AA0000",
    "Seattle Seahawks": "#002244",
    "Tampa Bay Buccaneers": "#D50A0A",
    "Tennessee Titans": "#0C2340",
    "Washington Commanders": "#5A1414",
}

# Skip these link texts when looking for person names in coaching tree sections
SKIP_LINK_WORDS = {
    "coach", "football", "league", "team", "bowl", "season", "stadium",
    "university", "college", "school", "conference", "national", "american",
    "pro bowl", "super bowl", "nfl", "afl", "afc", "nfc", "division",
    "playoff", "draft", "hall of fame", "cougars", "gators", "bears",
    "tigers", "lumberjacks", "miners", "packers", "vikings", "falcons",
    "ravens", "bills", "panthers", "bengals", "browns", "cowboys",
    "broncos", "lions", "texans", "colts", "jaguars", "chiefs", "raiders",
    "chargers", "rams", "dolphins", "patriots", "saints", "giants", "jets",
    "eagles", "steelers", "49ers", "seahawks", "buccaneers", "titans",
    "commanders", "redskins", "oilers",
}


def make_id(name):
    """Convert a coach name to a URL-friendly ID."""
    name = name.strip()
    name = re.sub(r"\s*\(.*?\)\s*", "", name)  # remove parentheticals
    name = name.lower()
    name = re.sub(r"[^a-z0-9\s-]", "", name)
    name = re.sub(r"\s+", "-", name)
    return name


def fetch_page_html(page_title):
    """Fetch parsed HTML of a Wikipedia page via the MediaWiki API."""
    params = {
        "action": "parse",
        "page": page_title,
        "prop": "text",
        "format": "json",
        "redirects": 1,
    }
    try:
        resp = SESSION.get(API_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if "parse" in data and "text" in data["parse"]:
            return data["parse"]["text"]["*"]
    except Exception as e:
        print(f"  [ERROR] Failed to fetch '{page_title}': {e}")
    return None


def extract_link_title(a_tag):
    """Extract the Wikipedia page title from a link tag."""
    href = a_tag.get("href", "")
    if "/wiki/" in href:
        after = href.split("/wiki/")[1]
        # Skip special pages, files, categories, etc.
        if ":" in after and not after.startswith("%"):
            return None
        title = unquote(after).replace("_", " ")
        return title
    return None


def is_person_link(link_text):
    """Check if a link text looks like a person's name (not a team/place)."""
    if len(link_text.split()) < 2:
        return False
    lower = link_text.lower()
    for skip in SKIP_LINK_WORDS:
        if skip in lower:
            return False
    # Reject if all-caps or contains numbers
    if re.search(r"\d", link_text):
        return False
    return True


def get_current_head_coaches():
    """Fetch the list of current NFL head coaches from Wikipedia."""
    print("Fetching list of current NFL head coaches...")
    html = fetch_page_html("List of current National Football League head coaches")
    if not html:
        print("  Failed to fetch head coaches list. Using fallback.")
        return get_fallback_coaches()

    soup = BeautifulSoup(html, "html.parser")
    coaches = []

    # The table structure: Cell[0]=Team, Cell[1]=Image, Cell[2]=Coach name+link
    tables = soup.find_all("table", class_="wikitable")
    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) < 3:
                continue

            # Look for the coach link in cell[2] (Coach column)
            coach_cell = cells[2]
            coach_link = coach_cell.find("a")
            if not coach_link:
                continue

            coach_name = coach_link.get_text(strip=True)
            coach_page = extract_link_title(coach_link)
            if not coach_page or len(coach_name.split()) < 2:
                continue

            # Team from cell[0]
            team_text = cells[0].get_text(strip=True)
            team_name = None
            for team in TEAM_COLORS:
                if team == team_text or team.split()[-1] in team_text:
                    team_name = team
                    break

            coaches.append({
                "name": coach_name,
                "page_title": coach_page,
                "team": team_name,
            })

    # Deduplicate
    seen = set()
    unique = []
    for c in coaches:
        if c["name"] not in seen:
            seen.add(c["name"])
            unique.append(c)

    if len(unique) < 10:
        print(f"  Only found {len(unique)} coaches from table, using fallback list.")
        return get_fallback_coaches()

    print(f"  Found {len(unique)} current head coaches.")
    return unique


def get_fallback_coaches():
    """Fallback list of current NFL head coaches."""
    coaches = [
        ("Jonathan Gannon", "Arizona Cardinals"),
        ("Raheem Morris", "Atlanta Falcons"),
        ("John Harbaugh", "Baltimore Ravens"),
        ("Sean McDermott", "Buffalo Bills"),
        ("Dave Canales", "Carolina Panthers"),
        ("Matt Eberflus", "Chicago Bears"),
        ("Zac Taylor", "Cincinnati Bengals"),
        ("Kevin Stefanski", "Cleveland Browns"),
        ("Mike McCarthy", "Dallas Cowboys"),
        ("Sean Payton", "Denver Broncos"),
        ("Dan Campbell", "Detroit Lions"),
        ("Matt LaFleur", "Green Bay Packers"),
        ("DeMeco Ryans", "Houston Texans"),
        ("Shane Steichen", "Indianapolis Colts"),
        ("Doug Pederson", "Jacksonville Jaguars"),
        ("Andy Reid", "Kansas City Chiefs"),
        ("Antonio Pierce", "Las Vegas Raiders"),
        ("Jim Harbaugh", "Los Angeles Chargers"),
        ("Sean McVay", "Los Angeles Rams"),
        ("Mike McDaniel", "Miami Dolphins"),
        ("Kevin O'Connell", "Minnesota Vikings"),
        ("Jerod Mayo", "New England Patriots"),
        ("Dennis Allen", "New Orleans Saints"),
        ("Brian Daboll", "New York Giants"),
        ("Robert Saleh", "New York Jets"),
        ("Nick Sirianni", "Philadelphia Eagles"),
        ("Mike Tomlin", "Pittsburgh Steelers"),
        ("Kyle Shanahan", "San Francisco 49ers"),
        ("Mike Macdonald", "Seattle Seahawks"),
        ("Todd Bowles", "Tampa Bay Buccaneers"),
        ("Brian Callahan", "Tennessee Titans"),
        ("Dan Quinn", "Washington Commanders"),
    ]
    return [
        {"name": name, "page_title": name, "team": team} for name, team in coaches
    ]


def get_elements_after_heading(html, heading_id_substring):
    """
    Given raw HTML, find all <p>, <ul>, <ol> elements between a heading
    containing heading_id_substring and the next same-level heading.
    Uses string-based approach since MediaWiki wraps headings in divs.
    """
    # Find the heading by its id attribute containing the substring
    pattern = re.compile(
        r'<h([23])\s[^>]*id="[^"]*' + re.escape(heading_id_substring) + r'[^"]*"[^>]*>',
        re.IGNORECASE
    )
    match = pattern.search(html)
    if not match:
        return []

    heading_level = match.group(1)
    start_pos = match.end()

    # Find the next heading of same or higher level
    next_heading = re.compile(r'<h[1-' + heading_level + r'][\s>]', re.IGNORECASE)
    end_match = next_heading.search(html, start_pos)
    end_pos = end_match.start() if end_match else len(html)

    section_html = html[start_pos:end_pos]
    section_soup = BeautifulSoup(section_html, "html.parser")

    return section_soup


def parse_coaching_tree_section(html, coach_name):
    """
    Parse the 'Coaching tree' section of a coach's Wikipedia page.
    Returns list of (linked_name, page_title, relationship, context_text).
    """
    results = []

    section_soup = get_elements_after_heading(html, "Coaching_tree")
    if not section_soup:
        # Try alternate heading IDs
        for alt in ["coaching_tree", "Coaching_Tree", "Coaching/executive_tree"]:
            section_soup = get_elements_after_heading(html, alt)
            if section_soup:
                break

    if not section_soup:
        return results

    # Get all text content to understand mentor vs protege context
    all_text = section_soup.get_text()
    mentor_section = False
    protege_section = False

    # Parse paragraphs to detect section context
    paragraphs = section_soup.find_all("p")
    current_context = "protege"  # default: listed names are proteges

    # Process all list items
    for elem in section_soup.find_all(["p", "ul", "ol"]):
        if elem.name == "p":
            p_text = elem.get_text(strip=True).lower()
            if "served under" in p_text or "has served under" in p_text or "worked under" in p_text:
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

            # Find the first person-name link
            for link in links:
                title = extract_link_title(link)
                if not title:
                    continue
                link_text = link.get_text(strip=True)
                if not is_person_link(link_text):
                    continue

                # Determine relationship from local context too
                li_lower = li_text.lower()
                relationship = current_context
                if "served under" in li_lower or "worked under" in li_lower:
                    relationship = "mentor"

                results.append((link_text, title, relationship, li_text[:200]))
                break  # only take first person link per list item

    return results


def parse_career_history(soup):
    """
    Parse coaching career history from the infobox.
    Returns list of {team, role, year_start, year_end}.
    """
    career = []

    infobox = soup.find("table", class_="infobox")
    if not infobox:
        return career

    rows = infobox.find_all("tr")
    in_coaching = False

    for row in rows:
        header = row.find("th")
        if header:
            header_text = header.get_text(strip=True).lower()
            if "coaching career" in header_text or "career history" in header_text:
                in_coaching = True
                continue
            elif in_coaching and any(
                kw in header_text
                for kw in [
                    "record", "playing career", "administrative",
                    "executive", "front office", "personal info",
                    "bowl record", "achievements", "honors",
                ]
            ):
                in_coaching = False
                continue

        if not in_coaching:
            continue

        cells = row.find_all("td")
        for cell in cells:
            text = cell.get_text(strip=True)
            year_matches = re.findall(
                r"(\d{4})\s*[-–]\s*(\d{4}|present)", text, re.IGNORECASE
            )
            if not year_matches:
                single_year = re.findall(r"(\d{4})", text)
                if single_year:
                    year_matches = [(single_year[0], single_year[0])]

            if year_matches:
                for ys, ye in year_matches:
                    ye_int = 2025 if ye.lower() == "present" else int(ye)
                    team_text = re.split(r"\d{4}", text)[0].strip()
                    team_text = re.sub(r"[()]", "", team_text).strip()

                    career.append({
                        "team": team_text if team_text else "Unknown",
                        "role": "",
                        "year_start": int(ys),
                        "year_end": ye_int,
                    })

    return career


def extract_years_from_context(context_text):
    """Try to extract year range from context text."""
    match = re.search(
        r"(\d{4})\s*[-–]\s*(\d{4}|present)", context_text, re.IGNORECASE
    )
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    match = re.search(r"\((\d{4})\)", context_text)
    if match:
        return match.group(1)
    return None


def scrape_coaching_trees():
    """Main scraping loop: BFS from current head coaches through coaching tree links."""
    seed_coaches = get_current_head_coaches()
    time.sleep(DELAY)

    coaches_data = {}  # id -> coach info
    connections = []
    visited = set()  # page titles already scraped
    career_data = {}  # coach_id -> career history

    queue = deque()  # (name, page_title, team, is_current_hc)

    for sc in seed_coaches:
        coach_id = make_id(sc["name"])
        coaches_data[coach_id] = {
            "id": coach_id,
            "name": sc["name"],
            "current_team": sc["team"],
            "is_current_hc": True,
        }
        queue.append((sc["name"], sc["page_title"], sc["team"], True))

    connection_set = set()
    max_depth = 5
    depth_map = {sc["page_title"]: 0 for sc in seed_coaches}

    total_scraped = 0
    max_pages = 300

    print(f"\nStarting recursive scrape with {len(queue)} seed coaches...")
    print(f"Max depth: {max_depth}, Max pages: {max_pages}\n")

    while queue and total_scraped < max_pages:
        name, page_title, team, is_current = queue.popleft()

        if page_title in visited:
            continue
        visited.add(page_title)

        current_depth = depth_map.get(page_title, 0)
        coach_id = make_id(name)

        print(f"[{total_scraped + 1}] Scraping: {name} (depth={current_depth})...")

        html = fetch_page_html(page_title)
        if not html:
            print(f"  Skipped (no HTML)")
            time.sleep(DELAY)
            continue

        soup = BeautifulSoup(html, "html.parser")
        total_scraped += 1

        if coach_id not in coaches_data:
            coaches_data[coach_id] = {
                "id": coach_id,
                "name": name,
                "current_team": team,
                "is_current_hc": is_current,
            }

        # Parse career history
        career = parse_career_history(soup)
        if career:
            career_data[coach_id] = career

        # Parse coaching tree section (pass raw HTML, not soup)
        tree_members = parse_coaching_tree_section(html, name)

        found_names = []
        for linked_name, linked_page, relationship, context in tree_members:
            linked_id = make_id(linked_name)
            found_names.append(linked_name)

            # Direction: mentor -> protege
            if relationship == "mentor":
                source_id = linked_id
                target_id = coach_id
            else:
                source_id = coach_id
                target_id = linked_id

            years = extract_years_from_context(context)

            conn_key = (source_id, target_id)
            reverse_key = (target_id, source_id)

            if conn_key not in connection_set and reverse_key not in connection_set:
                connection_set.add(conn_key)
                connections.append({
                    "source": source_id,
                    "target": target_id,
                    "type": "coaching_tree",
                    "years": years,
                    "context": context[:300] if context else None,
                })

            if linked_id not in coaches_data:
                coaches_data[linked_id] = {
                    "id": linked_id,
                    "name": linked_name,
                    "current_team": None,
                    "is_current_hc": False,
                }

            if linked_page not in visited and current_depth + 1 <= max_depth:
                depth_map[linked_page] = current_depth + 1
                queue.append((linked_name, linked_page, None, False))

        if found_names:
            print(f"  Found {len(found_names)} tree members: {', '.join(found_names[:5])}{'...' if len(found_names) > 5 else ''}")
        else:
            print(f"  No coaching tree section found")

        time.sleep(DELAY)

    # Cross-reference career histories
    print("\nCross-referencing career histories for overlapping tenures...")
    coach_ids = list(career_data.keys())
    for i, cid_a in enumerate(coach_ids):
        for cid_b in coach_ids[i + 1:]:
            for ca in career_data[cid_a]:
                for cb in career_data[cid_b]:
                    if (
                        ca["team"] and cb["team"]
                        and ca["team"] == cb["team"]
                        and ca["team"] != "Unknown"
                        and ca["year_start"] and cb["year_start"]
                        and ca["year_end"] and cb["year_end"]
                    ):
                        overlap_start = max(ca["year_start"], cb["year_start"])
                        overlap_end = min(ca["year_end"], cb["year_end"])
                        if overlap_start <= overlap_end:
                            conn_key = (cid_a, cid_b)
                            reverse_key = (cid_b, cid_a)
                            if conn_key not in connection_set and reverse_key not in connection_set:
                                connection_set.add(conn_key)
                                connections.append({
                                    "source": cid_a,
                                    "target": cid_b,
                                    "type": "career_overlap",
                                    "years": f"{overlap_start}-{overlap_end}",
                                    "context": f"Both at {ca['team']} ({overlap_start}-{overlap_end})",
                                })

    # Filter connections to valid coaches
    valid_ids = set(coaches_data.keys())
    connections = [
        c for c in connections if c["source"] in valid_ids and c["target"] in valid_ids
    ]

    # Keep connected coaches + all current HCs
    connected_ids = set()
    for c in connections:
        connected_ids.add(c["source"])
        connected_ids.add(c["target"])

    final_coaches = [
        cdata for cid, cdata in coaches_data.items()
        if cid in connected_ids or cdata["is_current_hc"]
    ]

    return {
        "coaches": final_coaches,
        "connections": connections,
        "team_colors": TEAM_COLORS,
    }


def main():
    print("=" * 60)
    print("NFL Coaching Tree Scraper")
    print("=" * 60)

    result = scrape_coaching_trees()

    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "coaching_connections.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 60}")
    print(f"Scraping complete!")
    print(f"  Coaches: {len(result['coaches'])}")
    print(f"  Connections: {len(result['connections'])}")
    print(f"  Output: {output_path}")
    print(f"{'=' * 60}")

    current_hcs = [c for c in result["coaches"] if c["is_current_hc"]]
    historical = [c for c in result["coaches"] if not c["is_current_hc"]]
    tree_conns = [c for c in result["connections"] if c["type"] == "coaching_tree"]
    overlap_conns = [c for c in result["connections"] if c["type"] == "career_overlap"]
    print(f"\n  Current HCs: {len(current_hcs)}")
    print(f"  Historical coaches: {len(historical)}")
    print(f"  Coaching tree connections: {len(tree_conns)}")
    print(f"  Career overlap connections: {len(overlap_conns)}")


if __name__ == "__main__":
    main()
