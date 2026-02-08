#!/usr/bin/env python3
"""
Patch script: add missing mentor connections for 7 current HCs
that have zero ancestors in the coaching tree data.

Also adds two new coach entries: Greg Schiano and Marty Schottenheimer.
"""

import json
import os

DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "data",
    "coaching_connections.json",
)

# ── New coach entries (only added if their ID doesn't already exist) ─────────
NEW_COACHES = [
    {
        "id": "greg-schiano",
        "name": "Greg Schiano",
        "current_team": None,
        "is_current_hc": False,
    },
    {
        "id": "marty-schottenheimer",
        "name": "Marty Schottenheimer",
        "current_team": None,
        "is_current_hc": False,
    },
    {
        "id": "mike-ditka",
        "name": "Mike Ditka",
        "current_team": None,
        "is_current_hc": False,
    },
    {
        "id": "bill-callahan",
        "name": "Bill Callahan",
        "current_team": None,
        "is_current_hc": False,
    },
]

# ── Missing connections: (source/mentor, target/protege) ─────────────────────
NEW_CONNECTIONS = [
    # Ben Johnson — 4 mentors
    ("joe-philbin",  "ben-johnson",  "Worked under Joe Philbin with the Dolphins"),
    ("matt-patricia", "ben-johnson", "Worked under Matt Patricia with the Lions"),
    ("dan-campbell",  "ben-johnson",  "Worked under Dan Campbell with the Lions"),
    ("adam-gase",     "ben-johnson",  "Worked under Adam Gase with the Dolphins"),
    # Jeff Hafley — 2 mentors (skipping Ryan Day — college only)
    ("matt-lafleur",  "jeff-hafley",  "Worked together in the NFL"),
    ("greg-schiano",  "jeff-hafley",  "Worked under Greg Schiano"),
    # Jim Harbaugh — 5 mentors
    ("mike-ditka",       "jim-harbaugh", "Jim Harbaugh played for Mike Ditka with the Chicago Bears (1987–1993)"),
    ("ted-marchibroda",  "jim-harbaugh", "Jim Harbaugh played for Ted Marchibroda with the Indianapolis Colts (1994–1997)"),
    ("brian-billick",    "jim-harbaugh", "Jim Harbaugh played for Brian Billick with the Baltimore Ravens (1998)"),
    ("george-seifert",   "jim-harbaugh", "Jim Harbaugh played for George Seifert with the Carolina Panthers (2001)"),
    ("bill-callahan",    "jim-harbaugh", "Jim Harbaugh coached under Bill Callahan with the Oakland Raiders (2002–2003)"),
    # Kevin Stefanski — 2 mentors
    ("mike-zimmer",   "kevin-stefanski", "Worked under Mike Zimmer with the Vikings"),
    ("gary-kubiak",   "kevin-stefanski", "Worked under Gary Kubiak with the Vikings"),
    # Matt LaFleur — 2 mentors
    ("kyle-shanahan", "matt-lafleur", "Worked under Kyle Shanahan"),
    ("sean-mcvay",    "matt-lafleur", "Worked alongside Sean McVay with the Rams"),
    # Mike LaFleur — 1 mentor
    ("kyle-shanahan", "mike-lafleur", "Worked under Kyle Shanahan with the 49ers"),
    # Mike McCarthy — 2 mentors
    ("bill-walsh",             "mike-mccarthy", "Worked under Bill Walsh"),
    ("marty-schottenheimer",   "mike-mccarthy", "Worked under Marty Schottenheimer with the Chiefs"),
]


def main():
    # 1. Load existing data
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    existing_ids = {c["id"] for c in data["coaches"]}
    existing_conns = {(c["source"], c["target"]) for c in data["connections"]}

    coaches_added = 0
    conns_added = 0

    # 2. Add new coach entries if missing
    for coach in NEW_COACHES:
        if coach["id"] not in existing_ids:
            data["coaches"].append(coach)
            existing_ids.add(coach["id"])
            coaches_added += 1
            print(f"  + Added coach: {coach['name']} ({coach['id']})")
        else:
            print(f"  = Coach already exists: {coach['name']}")

    # 3. Add new connections (skip duplicates)
    for source, target, context in NEW_CONNECTIONS:
        key = (source, target)
        rev = (target, source)
        if key in existing_conns or rev in existing_conns:
            print(f"  = Connection already exists: {source} → {target}")
            continue

        # Verify both coaches exist
        if source not in existing_ids:
            print(f"  ! WARNING: source coach '{source}' not found — skipping")
            continue
        if target not in existing_ids:
            print(f"  ! WARNING: target coach '{target}' not found — skipping")
            continue

        data["connections"].append({
            "source": source,
            "target": target,
            "type": "coaching_tree",
            "years": None,
            "context": context,
        })
        existing_conns.add(key)
        conns_added += 1
        print(f"  + Added connection: {source} → {target}")

    # 4. Save
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # 5. Summary
    total_coaches = len(data["coaches"])
    total_conns = len(data["connections"])
    total_hcs = sum(1 for c in data["coaches"] if c.get("is_current_hc"))
    print(f"\n{'='*50}")
    print(f"Coaches added:     {coaches_added}")
    print(f"Connections added:  {conns_added}")
    print(f"Total coaches:     {total_coaches}")
    print(f"Total connections: {total_conns}")
    print(f"Current HCs:       {total_hcs}")

    # 6. Depth analysis — verify all HCs have ancestors
    print(f"\n{'='*50}")
    print("Depth analysis: ancestors per current HC")
    print(f"{'='*50}")

    # Build adjacency: target → set of sources (mentors)
    mentors_of = {}
    for conn in data["connections"]:
        mentors_of.setdefault(conn["target"], set()).add(conn["source"])

    # BFS upward to find max depth for each HC
    hc_list = [c for c in data["coaches"] if c.get("is_current_hc")]
    hc_list.sort(key=lambda c: c["name"])

    all_have_ancestors = True
    for hc in hc_list:
        hc_id = hc["id"]
        # BFS to compute depth
        visited = set()
        frontier = {hc_id}
        depth = 0
        while frontier:
            next_frontier = set()
            for node in frontier:
                if node in visited:
                    continue
                visited.add(node)
                for mentor in mentors_of.get(node, []):
                    if mentor not in visited:
                        next_frontier.add(mentor)
            if next_frontier:
                depth += 1
            frontier = next_frontier

        ancestor_count = len(visited) - 1  # exclude self
        status = "OK" if ancestor_count > 0 else "NO ANCESTORS"
        if ancestor_count == 0:
            all_have_ancestors = False
        print(f"  {hc['name']:30s}  depth={depth}  ancestors={ancestor_count}  {status}")

    print()
    if all_have_ancestors:
        print("All current HCs have at least 1 ancestor.")
    else:
        print("WARNING: Some HCs still have no ancestors!")


if __name__ == "__main__":
    main()
