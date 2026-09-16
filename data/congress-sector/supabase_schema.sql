-- Suggested Supabase/Postgres schema for the generated member-sector data.

create table if not exists congress_members (
  bioguide text primary key,
  name text not null,
  chamber text,
  party text,
  state text,
  district integer,
  official_url text,
  updated_at timestamptz default now()
);

create table if not exists congress_member_assignments (
  id bigserial primary key,
  bioguide text not null references congress_members(bioguide) on delete cascade,
  committee_code text not null,
  committee text,
  subcommittee text,
  role text,
  committee_rank integer,
  source_url text,
  unique (bioguide, committee_code)
);

create table if not exists congress_member_sector_labels (
  bioguide text not null references congress_members(bioguide) on delete cascade,
  label text not null,
  primary key (bioguide, label)
);

create table if not exists congress_member_policy_topics (
  bioguide text not null references congress_members(bioguide) on delete cascade,
  topic text not null,
  primary key (bioguide, topic)
);

create table if not exists congress_member_sector_evidence (
  id bigserial primary key,
  bioguide text not null references congress_members(bioguide) on delete cascade,
  label_type text not null check (label_type in ('industry','policy_topic')),
  label text not null,
  committee_code text,
  committee text,
  subcommittee text,
  role text,
  basis text,
  source_url text
);

create index if not exists idx_congress_sector_label
  on congress_member_sector_labels(label);

create index if not exists idx_congress_evidence_bioguide
  on congress_member_sector_evidence(bioguide);
