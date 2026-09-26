-- Moving day: merge the Mac's database and the laptop's into one.
--
-- Run by merge-databases.sh, never by hand, inside ONE transaction
-- (psql --single-transaction -v ON_ERROR_STOP=1): any failed check raises,
-- and the whole merge rolls back. The database it runs in is a throwaway:
--
--   schema public  = the Mac's copy  (newer content, newer schema)
--   schema laptop  = the laptop's copy (the real people and payments)
--
-- The decision (docs/procedures/cutover.md, "Merging the two databases"):
--   * everything comes from the Mac, except
--   * the tables in laptop_tables, which come from the laptop, row for row;
--   * identity_email_owners: staff rows from the Mac, visitor rows from the laptop;
--   * laptop_columns: on rows the laptop edited after the split, the laptop's value;
--   * bookmarks: the Mac's, minus any whose reader is not in the laptop's users;
--   * payload_locked_documents: emptied (editing locks from a session that is gone).
-- Nothing here prints a person's data: only table names, ids and counts.

\set QUIET on
set search_path = public;
set client_min_messages = warning;

-- 1. The decision list ------------------------------------------------------

create temp table laptop_tables (t text primary key);
insert into laptop_tables values
  ('visitor_auth_users'), ('visitor_auth_accounts'), ('visitor_auth_sessions'),
  ('visitor_auth_verifications'), ('visitor_auth_rate_limits'),
  ('visitor_profiles'), ('stripe_webhook_events'), ('email_logs'),
  ('service_accounts');

-- Columns the laptop wins on, for rows it edited after the split. `access` is
-- the paywall: the migration that added it ran on the laptop first, and the
-- owner set members-only content there; the Mac only ever had the default.
create temp table laptop_columns (t text, c text, primary key (t, c));
insert into laptop_columns values ('articles', 'access'), ('listicle_itineraries', 'access');

-- Mac tables the lost-edit guard (step 4) does not inspect: Payload's own
-- bookkeeping, and the two tables merged by their own rule below.
create temp table guard_skips (t text primary key);
insert into guard_skips values
  ('payload_migrations'), ('payload_preferences'), ('payload_locked_documents'),
  ('payload_kv'), ('identity_email_owners'), ('bookmarks');

-- Every line the operator sees. Only names, ids and counts.
create temp table report (n serial, section text, detail text);

-- helpers
create function pg_temp.cols(s text, t text) returns text[] language sql stable as $$
  select coalesce(array_agg(column_name::text order by ordinal_position), '{}')
  from information_schema.columns where table_schema = s and table_name = t $$;

create function pg_temp.has_table(s text, t text) returns boolean language sql stable as $$
  select exists (select 1 from pg_tables where schemaname = s and tablename = t) $$;

create function pg_temp.count_rows(s text, t text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from %I.%I', s, t) into n;
  return n;
end $$;

-- 2. Before anything moves: counts, and whether the laptop fits the Mac schema

create temp table before_counts as
  select tablename::text as t,
         pg_temp.count_rows('public', tablename) as mac,
         case when pg_temp.has_table('laptop', tablename) then pg_temp.count_rows('laptop', tablename) end as laptop
  from pg_tables where schemaname = 'public';

create temp table mac_migrations as select name from public.payload_migrations;
create temp table mac_staff_identity as select * from public.identity_email_owners where owner_kind = 'staff';
create temp table merge_numbers (k text primary key, n bigint);

do $$
declare r record; missing text[];
begin
  -- A table only the laptop has would be silently dropped.
  for r in select tablename from pg_tables where schemaname = 'laptop'
           and not pg_temp.has_table('public', tablename) loop
    raise exception 'table % exists only on the laptop; decide where it goes before merging', r.tablename;
  end loop;

  -- The Mac must be at least as far along: every laptop migration is on the Mac.
  select array_agg(name) into missing from laptop.payload_migrations
   where name not in (select name from mac_migrations);
  if missing is not null then
    raise exception 'the laptop has migrations the Mac does not: %', missing;
  end if;

  -- Laptop-sourced tables must fit the Mac's schema: every laptop column
  -- exists on the Mac, and every Mac-only column can be left to its default.
  for r in select t from laptop_tables loop
    if not pg_temp.has_table('laptop', r.t) then
      raise exception 'laptop-sourced table % is missing on the laptop', r.t;
    end if;
    select array_agg(c) into missing
      from unnest(pg_temp.cols('laptop', r.t)) c where c <> all (pg_temp.cols('public', r.t));
    if missing is not null then
      raise exception '%: laptop columns the Mac schema lacks: %', r.t, missing;
    end if;
    select array_agg(column_name) into missing from information_schema.columns
     where table_schema = 'public' and table_name = r.t and is_nullable = 'NO' and column_default is null
       and column_name <> all (pg_temp.cols('laptop', r.t));
    if missing is not null then
      raise exception '%: Mac-only NOT NULL columns without a default: %', r.t, missing;
    end if;
  end loop;
end $$;

-- 3. When did the two copies split? The last migration both sides recorded at
-- the same instant happened before the split; each side ran the later ones on
-- its own. Laptop rows written after this are laptop-only edits.

create temp table split as
  select max(m.created_at) as at
  from public.payload_migrations m join laptop.payload_migrations l using (name)
  where m.created_at = l.created_at;

do $$ begin
  if (select at from split) is null then raise exception 'cannot find where the copies split'; end if;
end $$;
insert into report (section, detail)
  select 'split', 'copies split after ' || to_char(at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' from split;

-- 4. The lost-edit guard. For every Mac-sourced document table, the laptop
-- rows written after the split must be either identical to the Mac's, or
-- differ only in laptop_columns. Otherwise the merge would drop a laptop edit.
-- Compared: the row (minus id, updated_at and Mac-only columns) and its
-- direct children (blocks, arrays, rels whose parent column is an integer id).
-- Nested blocks-inside-blocks point at random block ids and are not compared.

create temp table laptop_edits (t text, id text, laptop_newer boolean, what text[]);

create function pg_temp.children(parent text) returns table (child text, pcol text) language sql stable as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  where c.table_schema = 'laptop' and c.table_name like parent || '\_%'
    and c.column_name in ('_parent_id', 'parent_id') and c.data_type = 'integer'
    and pg_temp.has_table('public', c.table_name) $$;

do $$
declare
  r record; ch record; d record;
  skip_cols text[]; mac_only text[]; n bigint;
begin
  for r in
    select b.t from before_counts b
    where b.laptop is not null
      and b.t not in (select t from laptop_tables) and b.t not in (select t from guard_skips)
      and 'id' = any (pg_temp.cols('laptop', b.t)) and 'updated_at' = any (pg_temp.cols('laptop', b.t))
  loop
    select coalesce(array_agg(c), '{}') into skip_cols from laptop_columns where t = r.t;
    skip_cols := skip_cols || array['id', 'updated_at'];
    select coalesce(array_agg(c), '{}') into mac_only
      from unnest(pg_temp.cols('public', r.t)) c where c <> all (pg_temp.cols('laptop', r.t));

    for d in execute format($q$
      select l.id::text as id, m.id is null as mac_missing,
             m.id is null or l.updated_at > m.updated_at as laptop_newer,
             array(select k from jsonb_each(to_jsonb(l)) e(k, v)
                    where k <> all ($1) and v is distinct from (to_jsonb(m) - $2) -> k) as cols
      from laptop.%1$I l left join public.%1$I m on m.id = l.id
      where l.updated_at > (select at from split)$q$, r.t)
      using skip_cols, mac_only
    loop
      if d.mac_missing then
        insert into laptop_edits values (r.t, d.id, true, array['row exists only on the laptop']);
        continue;
      end if;
      for ch in select * from pg_temp.children(r.t) loop
        execute format($q$
          with m as (select to_jsonb(x) - $2 - 'id' as j from public.%1$I x where %2$I = $1::int),
               l as (select to_jsonb(x) - 'id' as j from laptop.%1$I x where %2$I = $1::int)
          select count(*) from ((select j from m except all select j from l)
                                union all (select j from l except all select j from m)) z$q$,
          ch.child, ch.pcol)
          into n using d.id,
            (select coalesce(array_agg(c), '{}') from unnest(pg_temp.cols('public', ch.child)) c
              where c <> all (pg_temp.cols('laptop', ch.child)));
        if n > 0 then d.cols := d.cols || ch.child; end if;
      end loop;
      if cardinality(d.cols) > 0 then
        insert into laptop_edits values (r.t, d.id, d.laptop_newer, d.cols);
      end if;
    end loop;
  end loop;
end $$;

insert into report (section, detail)
  select 'edited on both sides, Mac newer, Mac kept',
         format('%s %s: laptop differs in %s', t,
                case when count(*) > 3 then count(*) || ' rows' else 'id ' || string_agg(id, ', ' order by id) end,
                (select string_agg(distinct w, ', ') from laptop_edits e2, unnest(e2.what) w
                  where e2.t = e.t and not e2.laptop_newer))
  from laptop_edits e where not laptop_newer group by t order by t;

do $$
declare lost text;
begin
  select string_agg(t || ' ' || id || ' (' || array_to_string(what, ', ') || ')', '; ' order by t, id)
    into lost from laptop_edits where laptop_newer;
  if lost is not null and coalesce(current_setting('merge.accept_lost_laptop_edits', true), '') <> 'yes' then
    raise exception using message =
      'the laptop edited content after the split that the merge would drop: ' || lost,
      hint = 'Make the same edit on the Mac and dump it again, or add a rule to merge-databases.sql. '
          || '--accept-lost-laptop-edits drops them on purpose.';
  end if;
  if lost is not null then
    insert into report (section, detail) values ('laptop edits dropped on purpose', lost);
  end if;
end $$;

-- 5. The merge. Triggers and FK checks are off while rows move
-- (session_replication_role = replica); step 6 checks every FK afterwards.

set session_replication_role = replica;

create temp table overlay_counts (t text, c text, n bigint);

do $$
declare r record; names text; casts text; seq record; n bigint;
begin
  -- 5a. Laptop tables, row for row. Values pass through text so the laptop's
  -- enum types (schema laptop) become the Mac's (schema public).
  for r in select t from laptop_tables loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           string_agg(format('%I::text::%s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum)
      into names, casts
      from pg_attribute a
     where a.attrelid = format('public.%I', r.t)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname = any (pg_temp.cols('laptop', r.t));
    execute format('delete from public.%I', r.t);
    execute format('insert into public.%I (%s) select %s from laptop.%I', r.t, names, casts, r.t);
    -- The id counter carries on exactly where the laptop's did.
    for seq in
      select s.relname::text as name from pg_class s
        join pg_depend dep on dep.objid = s.oid and dep.deptype in ('a', 'i')
        join pg_class tbl on tbl.oid = dep.refobjid
       where s.relkind = 'S' and tbl.relname = r.t and tbl.relnamespace = 'public'::regnamespace
    loop
      if to_regclass(format('laptop.%I', seq.name)) is null then
        raise exception 'sequence % has no laptop counterpart', seq.name;
      end if;
      execute format('select setval(%L, last_value, is_called) from laptop.%I',
                     format('public.%I', seq.name), seq.name);
    end loop;
  end loop;

  -- 5b. identity_email_owners: one email, one owner, across staff and readers.
  -- Staff follow users (Mac), readers follow visitor_auth_users (laptop).
  delete from public.identity_email_owners where owner_kind = 'visitor';
  insert into public.identity_email_owners (normalized_email, owner_kind, owner_id)
    select normalized_email, owner_kind, owner_id from laptop.identity_email_owners where owner_kind = 'visitor';

  -- 5c. bookmarks exist only on the Mac; keep those whose reader is real.
  delete from public.bookmarks b
   where not exists (select 1 from public.visitor_auth_users u where u.id = b.auth_user_id);
  get diagnostics n = row_count;
  insert into merge_numbers values ('bookmarks dropped', n);
  insert into report (section, detail) values ('bookmarks', n || ' dropped (reader not on the laptop)');

  -- 5d. Editing locks belong to sessions that end at the move.
  delete from public.payload_locked_documents_rels;
  delete from public.payload_locked_documents;

  -- 5e. laptop_columns on rows the laptop edited after the split.
  for r in select * from laptop_columns loop
    execute format($q$
      update public.%1$I m set %2$I = l.%2$I::text::%3$s
        from laptop.%1$I l
       where l.id = m.id and l.updated_at > (select at from split)
         and l.%2$I::text is distinct from m.%2$I::text$q$,
      r.t, r.c,
      (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
        where a.attrelid = format('public.%I', r.t)::regclass and a.attname = r.c));
    get diagnostics n = row_count;
    insert into overlay_counts values (r.t, r.c, n);
  end loop;
end $$;

set session_replication_role = origin;

insert into report (section, detail)
  select 'laptop value kept', t || '.' || c || ': ' || n || ' rows' from overlay_counts order by t, c;

-- 6. Checks. Each raises; a raise rolls the whole merge back.

-- 6a. Row counts equal the chosen source.
do $$
declare r record; expected bigint; actual bigint; bad text := '';
begin
  for r in select * from before_counts order by t loop
    expected := case
      when r.t in (select t from laptop_tables) then r.laptop
      when r.t = 'identity_email_owners' then
        (select count(*) from mac_staff_identity) + (select count(*) from laptop.identity_email_owners where owner_kind = 'visitor')
      when r.t = 'bookmarks' then r.mac - (select n from merge_numbers where k = 'bookmarks dropped')
      when r.t like 'payload\_locked\_documents%' then 0
      else r.mac end;
    actual := pg_temp.count_rows('public', r.t);
    if actual is distinct from expected then
      bad := bad || format(' %s: %s rows, expected %s;', r.t, actual, expected);
    end if;
  end loop;
  if bad <> '' then raise exception 'row counts do not match the chosen source:%', bad; end if;
end $$;

-- 6b. Laptop tables are the laptop's rows exactly, not just the same count.
do $$
declare r record; n bigint;
begin
  for r in select t from laptop_tables loop
    execute format($q$
      with m as (select to_jsonb(x) - $1 as j from public.%1$I x),
           l as (select to_jsonb(x) as j from laptop.%1$I x)
      select count(*) from ((select j from m except all select j from l)
                            union all (select j from l except all select j from m)) z$q$, r.t)
      into n using (select coalesce(array_agg(c), '{}') from unnest(pg_temp.cols('public', r.t)) c
                     where c <> all (pg_temp.cols('laptop', r.t)));
    if n > 0 then raise exception '%: % rows differ from the laptop', r.t, n; end if;
  end loop;
end $$;

-- 6c. Every foreign key resolves (they were not enforced during step 5).
do $$
declare r record; n bigint;
begin
  for r in
    select conrelid::regclass as child, confrelid::regclass as parent, conname,
           (select string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' and ')
              from unnest(conkey, confkey) k(c, p)
              join pg_attribute ca on ca.attrelid = conrelid and ca.attnum = k.c
              join pg_attribute pa on pa.attrelid = confrelid and pa.attnum = k.p) as joins,
           (select string_agg(format('c.%I is not null', ca.attname), ' and ')
              from unnest(conkey) k(c) join pg_attribute ca on ca.attrelid = conrelid and ca.attnum = k.c) as present
    from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
  loop
    execute format('select count(*) from %s c where %s and not exists (select 1 from %s p where %s)',
                   r.child, r.present, r.parent, r.joins) into n;
    if n > 0 then raise exception 'foreign key %: % rows in % point at nothing', r.conname, n, r.child; end if;
  end loop;
end $$;

-- 6d. People and money hang together.
do $$
declare n bigint;
begin
  -- identity_email_owners is exactly what its triggers would have built.
  select count(*) into n from (
    ((select lower(btrim(email)), 'staff', id::text from public.users
      union all select lower(btrim(email)), 'visitor', id from public.visitor_auth_users)
     except all select normalized_email, owner_kind, owner_id from public.identity_email_owners)
    union all
    (select normalized_email, owner_kind, owner_id from public.identity_email_owners
     except all (select lower(btrim(email)), 'staff', id::text from public.users
                 union all select lower(btrim(email)), 'visitor', id from public.visitor_auth_users))) z;
  if n > 0 then raise exception 'identity_email_owners: % rows disagree with users + visitor_auth_users', n; end if;

  -- Stripe ownership is metadata.visitorAuthUserId = visitor_profiles.auth_user_id.
  -- A profile with a Stripe customer must belong to a reader who exists.
  select count(*) into n from public.visitor_profiles p
   where not exists (select 1 from public.visitor_auth_users u where u.id = p.auth_user_id);
  if n > 0 then raise exception 'visitor_profiles: % profiles whose reader does not exist', n; end if;
  select count(*) into n from (select stripe_customer_id from public.visitor_profiles
   where stripe_customer_id is not null group by 1 having count(*) > 1) z;
  if n > 0 then raise exception 'visitor_profiles: a Stripe customer is linked to more than one profile'; end if;

  select count(*) into n from public.bookmarks b
   where not exists (select 1 from public.visitor_auth_users u where u.id = b.auth_user_id);
  if n > 0 then raise exception 'bookmarks: % rows whose reader does not exist', n; end if;

  -- The schema ends where the Mac's did.
  select count(*) into n from (
    (select name from public.payload_migrations except select name from mac_migrations)
    union all (select name from mac_migrations except select name from public.payload_migrations)) z;
  if n > 0 then raise exception 'payload_migrations differs from the Mac''s'; end if;
end $$;

insert into report (section, detail)
  select 'people', format('%s readers, %s profiles (%s with a Stripe customer), %s sign-in methods, %s webhook events, %s email logs',
    (select count(*) from public.visitor_auth_users), (select count(*) from public.visitor_profiles),
    (select count(*) from public.visitor_profiles where stripe_customer_id is not null),
    (select count(*) from public.visitor_auth_accounts), (select count(*) from public.stripe_webhook_events),
    (select count(*) from public.email_logs));
insert into report (section, detail)
  select 'schema', count(*) || ' migrations, last ' || max(name) from public.payload_migrations;

-- 7. Only the merged database leaves.
drop schema laptop cascade;

\pset footer off
\pset tuples_only on
\pset format unaligned
\pset fieldsep ': '
select section, detail from report order by n;
