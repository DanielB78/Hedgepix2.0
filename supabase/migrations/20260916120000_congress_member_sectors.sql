-- Congressional member sector exposure (committee jurisdiction → industry labels).
-- Links to existing trades via member_slug (not a duplicate member system).

create table if not exists congress_members (
  bioguide text primary key,
  name text not null,
  member_slug text,
  chamber text,
  party text,
  state text,
  district integer,
  official_url text,
  updated_at timestamptz default now()
);

create table if not exists congress_member_slug_aliases (
  member_slug text primary key,
  bioguide text not null references congress_members(bioguide) on delete cascade
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

-- Cached BGE embeddings for congress industry labels + ticker industry labels.
create table if not exists sector_label_embeddings (
  normalized_label text primary key,
  label text not null,
  label_source text not null check (label_source in ('congress', 'ticker')),
  embedding jsonb not null,
  model_id text not null,
  updated_at timestamptz default now()
);

create index if not exists idx_congress_members_slug
  on congress_members(member_slug);
create index if not exists idx_congress_sector_label
  on congress_member_sector_labels(label);
create index if not exists idx_congress_evidence_bioguide
  on congress_member_sector_evidence(bioguide);
create index if not exists idx_sector_label_embeddings_source
  on sector_label_embeddings(label_source);

grant select on congress_members to anon, authenticated, service_role;
grant select on congress_member_slug_aliases to anon, authenticated, service_role;
grant select on congress_member_assignments to anon, authenticated, service_role;
grant select on congress_member_sector_labels to anon, authenticated, service_role;
grant select on congress_member_policy_topics to anon, authenticated, service_role;
grant select on congress_member_sector_evidence to anon, authenticated, service_role;
grant select on sector_label_embeddings to anon, authenticated, service_role;

grant all on congress_members to service_role;
grant all on congress_member_slug_aliases to service_role;
grant all on congress_member_assignments to service_role;
grant all on congress_member_sector_labels to service_role;
grant all on congress_member_policy_topics to service_role;
grant all on congress_member_sector_evidence to service_role;
grant all on sector_label_embeddings to service_role;
grant usage, select on all sequences in schema public to service_role;
