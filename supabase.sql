-- Kalori Takip — Supabase şeması
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run

-- Ayarlar (hedefler) — kullanıcı başına tek satır
create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  targets    jsonb not null,
  updated_at timestamptz not null default now()
);

-- Yiyecek listesi
create table if not exists public.foods (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  portion    text not null default '',
  grams      numeric,               -- 1 porsiyon kaç gram (gramla eklemek için, opsiyonel)
  kcal       numeric not null default 0,
  protein    numeric not null default 0,
  carb       numeric not null default 0,
  fat        numeric not null default 0,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

-- Kayıtlı öğünler (items: [{ "food_id": "...", "qty": 1 }])
create table if not exists public.meals (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  items      jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Gün tipi (spor / dinlenme)
create table if not exists public.days (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  date     date not null,
  day_type text not null check (day_type in ('spor', 'dinlenme')),
  primary key (user_id, date)
);

-- Güne eklenen yiyecekler (değerler eklendiği anda kopyalanır; yiyecek sonradan düzenlense de geçmiş değişmez)
create table if not exists public.entries (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  date       date not null,
  food_id    uuid,
  name       text not null,
  qty        numeric not null default 1,
  qty_label  text not null default '',
  kcal       numeric not null default 0,
  protein    numeric not null default 0,
  carb       numeric not null default 0,
  fat        numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists entries_user_date_idx on public.entries (user_id, date);

-- Row Level Security: her kullanıcı yalnızca kendi satırlarını görür/değiştirir
alter table public.settings enable row level security;
alter table public.foods    enable row level security;
alter table public.meals    enable row level security;
alter table public.days     enable row level security;
alter table public.entries  enable row level security;

drop policy if exists "sadece_sahibi" on public.settings;
drop policy if exists "sadece_sahibi" on public.foods;
drop policy if exists "sadece_sahibi" on public.meals;
drop policy if exists "sadece_sahibi" on public.days;
drop policy if exists "sadece_sahibi" on public.entries;

create policy "sadece_sahibi" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sadece_sahibi" on public.foods for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sadece_sahibi" on public.meals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sadece_sahibi" on public.days for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sadece_sahibi" on public.entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- API erişimi yalnızca giriş yapmış kullanıcıya (anonim erişim yok)
revoke all on public.settings, public.foods, public.meals, public.days, public.entries from anon;
grant select, insert, update, delete
  on public.settings, public.foods, public.meals, public.days, public.entries
  to authenticated;
