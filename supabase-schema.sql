-- Ejecuta este archivo en Supabase > SQL Editor.
-- Luego copia la URL y la anon key del proyecto a .env.local.

create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 5,
  unit text not null default 'und.',
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id text primary key,
  customer text not null default 'Familia del colegio',
  customer_id text,
  carnet text not null default '',
  payment text not null,
  cash_amount numeric(12,2) not null default 0,
  qr_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table sales add column if not exists customer_id text;
alter table sales add column if not exists carnet text not null default '';
alter table sales add column if not exists cash_amount numeric(12,2) not null default 0;
alter table sales add column if not exists qr_amount numeric(12,2) not null default 0;
alter table sales add column if not exists status text not null default 'Vigente';
alter table sales add column if not exists voided_at timestamptz;

create table if not exists materials (
  id text primary key,
  name text not null,
  category text not null,
  location text not null,
  status text not null default 'Disponible',
  borrower text not null default '',
  due text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists teachers (
  id text primary key,
  name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id text primary key,
  name text not null,
  carnet text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists loans (
  id text primary key,
  action text not null,
  material text not null,
  teacher text not null,
  loaned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists cash_movements (
  id text primary key,
  type text not null,
  concept text not null,
  amount numeric(12,2) not null default 0,
  payment text,
  cash_amount numeric(12,2) not null default 0,
  qr_amount numeric(12,2) not null default 0,
  moved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table products enable row level security;
alter table sales enable row level security;
alter table materials enable row level security;
alter table teachers enable row level security;
alter table customers enable row level security;
alter table loans enable row level security;
alter table cash_movements enable row level security;

create policy "app access products" on products for all to anon using (true) with check (true);
create policy "app access sales" on sales for all to anon using (true) with check (true);
create policy "app access materials" on materials for all to anon using (true) with check (true);
create policy "app access teachers" on teachers for all to anon using (true) with check (true);
create policy "app access customers" on customers for all to anon using (true) with check (true);
create policy "app access loans" on loans for all to anon using (true) with check (true);
create policy "app access cash" on cash_movements for all to anon using (true) with check (true);
