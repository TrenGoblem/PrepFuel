-- Fuelr 2.0 cloud schema (Supabase/Postgres)
-- Safe to keep in source control. Do not place service-role keys in the repository.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id text primary key,
  name text not null,
  abbreviation text not null,
  primary_color text not null,
  secondary_color text not null,
  accent_color text not null,
  on_primary text not null default '#ffffff',
  created_at timestamptz not null default now()
);

insert into public.schools (id,name,abbreviation,primary_color,secondary_color,accent_color,on_primary)
values
  ('fuelr','Fuelr','FR','#657ff0','#1d232b','#9db4ff','#ffffff'),
  ('ucf','University of Central Florida','UCF','#ffc904','#000000','#ffdf66','#111111'),
  ('uf','University of Florida','UF','#0021a5','#fa4616','#fa4616','#ffffff'),
  ('fsu','Florida State University','FSU','#782f40','#ceb888','#ceb888','#ffffff'),
  ('usf','University of South Florida','USF','#006747','#cfc493','#cfc493','#ffffff'),
  ('miami','University of Miami','UM','#f47321','#005030','#005030','#ffffff'),
  ('fiu','Florida International University','FIU','#081e3f','#b6862c','#b6862c','#ffffff'),
  ('fau','Florida Atlantic University','FAU','#003366','#cc0000','#cc0000','#ffffff')
on conflict (id) do update set
  name=excluded.name,
  abbreviation=excluded.abbreviation,
  primary_color=excluded.primary_color,
  secondary_color=excluded.secondary_color,
  accent_color=excluded.accent_color,
  on_primary=excluded.on_primary;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id text references public.schools(id) default 'fuelr',
  display_name text,
  school_year_budget numeric(10,2) not null default 2500,
  academic_weeks integer not null default 32 check (academic_weeks between 1 and 60),
  meals_per_week integer not null default 14 check (meals_per_week between 1 and 42),
  preferred_store text not null default 'Aldi',
  alt_store text not null default 'Walmart',
  prep_style text not null default 'split' check (prep_style in ('split','single')),
  portion_mode text not null default 'athlete',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  source_name text,
  source_servings numeric(8,2) not null default 1,
  optimized_servings integer not null default 14,
  source_batch_cost numeric(10,2),
  optimized_cost_per_meal numeric(10,2),
  calories numeric(10,2),
  protein_g numeric(10,2),
  carbs_g numeric(10,2),
  fat_g numeric(10,2),
  photo_url text,
  optimization_note text,
  instructions jsonb not null default '[]'::jsonb,
  visibility text not null default 'private' check (visibility in ('private','community')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  sort_order integer not null default 0,
  item text not null,
  source_quantity numeric(12,4),
  source_unit text,
  optimized_quantity numeric(12,4),
  optimized_unit text,
  category text,
  used_cost numeric(10,2),
  note text
);

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  status text not null default 'planning' check (status in ('planning','shopping','prepping','complete')),
  meal_target numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

create table if not exists public.weekly_plan_recipes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  meal_count integer not null check (meal_count in (7,14)),
  slot integer not null default 1 check (slot in (1,2)),
  unique(plan_id, slot)
);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  item text not null,
  quantity numeric(12,4),
  unit text,
  category text,
  preferred_store text,
  alt_store text,
  estimated_checkout_cost numeric(10,2),
  checked boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.prep_checks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  check_type text not null check (check_type in ('cooked','portioned','stored','meal')),
  meal_index integer,
  checked boolean not null default false,
  unique(plan_id, recipe_id, check_type, meal_index)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists recipes_updated_at on public.recipes;
create trigger recipes_updated_at before update on public.recipes
for each row execute function public.set_updated_at();

drop trigger if exists weekly_plans_updated_at on public.weekly_plans;
create trigger weekly_plans_updated_at before update on public.weekly_plans
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_recipes enable row level security;
alter table public.grocery_items enable row level security;
alter table public.prep_checks enable row level security;

drop policy if exists "schools readable by everyone" on public.schools;
create policy "schools readable by everyone" on public.schools
for select using (true);

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
for select using (auth.uid() = user_id);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "recipes visible to owner or community" on public.recipes;
create policy "recipes visible to owner or community" on public.recipes
for select using (owner_id = auth.uid() or visibility = 'community');
drop policy if exists "users insert own recipes" on public.recipes;
create policy "users insert own recipes" on public.recipes
for insert with check (owner_id = auth.uid());
drop policy if exists "users update own recipes" on public.recipes;
create policy "users update own recipes" on public.recipes
for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "users delete own recipes" on public.recipes;
create policy "users delete own recipes" on public.recipes
for delete using (owner_id = auth.uid());

drop policy if exists "ingredients follow recipe visibility" on public.recipe_ingredients;
create policy "ingredients follow recipe visibility" on public.recipe_ingredients
for select using (exists (
  select 1 from public.recipes r
  where r.id = recipe_id and (r.owner_id = auth.uid() or r.visibility = 'community')
));
drop policy if exists "owners manage recipe ingredients" on public.recipe_ingredients;
create policy "owners manage recipe ingredients" on public.recipe_ingredients
for all using (exists (
  select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()
));

drop policy if exists "users manage own weekly plans" on public.weekly_plans;
create policy "users manage own weekly plans" on public.weekly_plans
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own plan recipes" on public.weekly_plan_recipes;
create policy "users manage own plan recipes" on public.weekly_plan_recipes
for all using (exists (
  select 1 from public.weekly_plans p where p.id = plan_id and p.user_id = auth.uid()
)) with check (exists (
  select 1 from public.weekly_plans p where p.id = plan_id and p.user_id = auth.uid()
));

drop policy if exists "users manage own grocery items" on public.grocery_items;
create policy "users manage own grocery items" on public.grocery_items
for all using (exists (
  select 1 from public.weekly_plans p where p.id = plan_id and p.user_id = auth.uid()
)) with check (exists (
  select 1 from public.weekly_plans p where p.id = plan_id and p.user_id = auth.uid()
));

drop policy if exists "users manage own prep checks" on public.prep_checks;
create policy "users manage own prep checks" on public.prep_checks
for all using (exists (
  select 1 from public.weekly_plans p where p.id = plan_id and p.user_id = auth.uid()
)) with check (exists (
  select 1 from public.weekly_plans p where p.id = plan_id and p.user_id = auth.uid()
));


-- Fuelr live hardening additions
-- These statements mirror production migrations applied after the initial schema.

alter table public.weekly_plan_recipes alter column recipe_id drop not null;
alter table public.weekly_plan_recipes add column if not exists recipe_key text;
alter table public.weekly_plan_recipes add column if not exists recipe_name text;
alter table public.grocery_items add column if not exists recipe_key text;
alter table public.grocery_items add column if not exists item_key text;
alter table public.prep_checks add column if not exists recipe_key text;
alter table public.recipes add column if not exists client_source_id text;
alter table public.profiles add column if not exists dietary_preferences text[] not null default '{}';
alter table public.profiles add column if not exists allergies text[] not null default '{}';
alter table public.profiles add column if not exists goal text not null default 'balanced';

create unique index if not exists uq_recipes_owner_client_source
on public.recipes(owner_id, client_source_id)
where client_source_id is not null;

create index if not exists idx_profiles_school_id on public.profiles(school_id);
create index if not exists idx_recipes_owner_id on public.recipes(owner_id);
create index if not exists idx_recipe_ingredients_recipe_id on public.recipe_ingredients(recipe_id);
create index if not exists idx_weekly_plans_user_start on public.weekly_plans(user_id, week_start);
create index if not exists idx_weekly_plan_recipes_plan_id on public.weekly_plan_recipes(plan_id);
create index if not exists idx_weekly_plan_recipes_recipe_id on public.weekly_plan_recipes(recipe_id);
create index if not exists idx_grocery_items_plan_id on public.grocery_items(plan_id);
create index if not exists idx_grocery_items_recipe_id on public.grocery_items(recipe_id);
create index if not exists idx_prep_checks_plan_id on public.prep_checks(plan_id);
create index if not exists idx_prep_checks_recipe_id on public.prep_checks(recipe_id);
create index if not exists idx_grocery_items_item_key on public.grocery_items(plan_id, item_key);


-- Private recipe image storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Fuelr users upload own recipe images" on storage.objects;
create policy "Fuelr users upload own recipe images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

drop policy if exists "Fuelr users read own recipe images" on storage.objects;
create policy "Fuelr users read own recipe images"
on storage.objects for select to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

drop policy if exists "Fuelr users update own recipe images" on storage.objects;
create policy "Fuelr users update own recipe images"
on storage.objects for update to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
)
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

drop policy if exists "Fuelr users delete own recipe images" on storage.objects;
create policy "Fuelr users delete own recipe images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
