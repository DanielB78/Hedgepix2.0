# Congress Member → Sector Exposure Database

This bundle creates a current House + Senate database linking members to specific
industry labels using their public committee and subcommittee assignments.

## Important interpretation

The mapping is **committee-jurisdiction exposure**, not an accusation or claim that
a member has company "insider information." Committee work can involve hearings,
briefings, legislation, regulation, appropriations, oversight, and in some cases
classified information. That does not establish possession of material nonpublic
information about a particular company or misuse of information.

## Why there are two label types

### `industry_labels`
Specific investable/business sectors suitable for matching against ticker labels,
e.g.:

- Nuclear power
- Cybersecurity
- Semiconductors
- Commercial aerospace
- Banking
- Digital assets
- Pharmaceuticals
- Water infrastructure

These are intentionally similar to the ticker-industry labels used elsewhere in
Hedgepix.

### `policy_topics`
Jurisdiction that should *not* be forced into an industry mapping, e.g.:

- Antitrust
- Trade policy
- Classified intelligence
- Tax policy
- Military procurement

Keep these separate from ticker-sector matching unless you later design explicit
rules for them.

## Evidence

Every generated sector label has an evidence row recording the committee or
subcommittee that produced the mapping, the member's role if present, and a source
URL.

The system does **not** assign a numerical "influence score."

## Build

```bash
pip install requests
python build_congress_member_sector_db.py
```

The script downloads current committee membership, committee definitions, and
current legislator metadata, then creates:

- `congress_member_sector_exposure.sqlite`
- `congress_member_sector_exposure.json`
- `congress_member_sector_exposure.csv`
- `congress_member_sector_evidence.csv`

## Supabase

`supabase_schema.sql` contains a normalized schema suitable for storing the output.

Recommended app relationship:

```text
Congress member
    ↓
current committee/subcommittee assignments
    ↓
specific industry labels
    ↓
match against ticker industry labels
```

A member can have any number of industry labels, and a ticker can have any number
of industry labels. Match them by exact normalized label or through a controlled
alias table; do not use fuzzy string matching by default.

## Refreshing

Committee assignments change, so rebuild/update this dataset whenever the
congressional data updater runs or at least periodically.
