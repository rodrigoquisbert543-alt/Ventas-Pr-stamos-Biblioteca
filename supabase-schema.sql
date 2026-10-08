-- Ejecuta este archivo en Supabase > SQL Editor.
-- Luego copia la URL y la anon key del proyecto a .env.local.

create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(12,2) not null default 0,
  purchase_cost numeric(12,2) not null default 0,
  stock numeric(12,2) not null default 0,
  min_stock integer not null default 5,
  unit text not null default 'und.',
  section text not null default '',
  book_courses jsonb not null default '[]'::jsonb,
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
alter table products add column if not exists purchase_cost numeric(12,2) not null default 0;
alter table products add column if not exists section text not null default '';
alter table products add column if not exists book_courses jsonb not null default '[]'::jsonb;
alter table sales add column if not exists student_id text;
create index if not exists sales_student_idx on sales (student_id);
alter table products alter column stock type numeric(12,2) using stock::numeric;

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
  family text not null default '',
  relation text not null default '',
  created_at timestamptz not null default now()
);

alter table customers add column if not exists family text not null default '';
alter table customers add column if not exists relation text not null default '';

alter table sales add column if not exists family text not null default '';
alter table sales add column if not exists relation text not null default '';
alter table sales add column if not exists payer text not null default '';
alter table sales add column if not exists payer_id text;
alter table sales add column if not exists payer_relation text not null default '';

create table if not exists students (
  id text primary key,
  name text not null,
  carnet text not null default '',
  course text not null,
  guardian_id text,
  guardian_name text not null default '',
  family text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists students_course_idx on students (course);
create index if not exists students_guardian_idx on students (guardian_id);

create table if not exists student_book_records (
  id text primary key,
  student_id text not null,
  product_id text not null,
  status text not null default 'Comprado',
  source text not null default 'Anterior al sistema',
  purchased_at timestamptz not null default now(),
  unique (student_id, product_id)
);

create index if not exists student_book_records_student_idx on student_book_records (student_id);

create table if not exists loans (
  id text primary key,
  action text not null,
  material text not null,
  material_id text,
  teacher text not null,
  teacher_id text,
  due text not null default '',
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
  reason text not null default '',
  operation text not null default '',
  product_id text,
  quantity numeric(12,2) not null default 0,
  moved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists purchase_orders (
  id text primary key,
  supplier text not null,
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  status text not null default 'Pendiente',
  ordered_at timestamptz not null default now(),
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists accounts_receivable (
  id text primary key,
  guardian_name text not null,
  student_name text not null default '',
  grade text not null default '',
  carnet text not null default '',
  family text not null default '',
  gestion text not null,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  payment_history jsonb not null default '[]'::jsonb,
  contract text not null default '',
  commitment text not null default '',
  infocred_status text not null default 'Pendiente',
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table products enable row level security;
alter table sales enable row level security;
alter table materials enable row level security;
alter table teachers enable row level security;
alter table customers enable row level security;
alter table students enable row level security;
alter table student_book_records enable row level security;
alter table loans enable row level security;
alter table cash_movements enable row level security;
alter table purchase_orders enable row level security;
alter table accounts_receivable enable row level security;
alter table app_settings enable row level security;
alter table cash_movements add column if not exists reason text not null default '';
alter table cash_movements add column if not exists operation text not null default '';
alter table cash_movements add column if not exists product_id text;
alter table cash_movements add column if not exists quantity integer not null default 0;
alter table cash_movements alter column quantity type numeric(12,2) using quantity::numeric;
alter table loans add column if not exists material_id text;
alter table loans add column if not exists teacher_id text;
alter table loans add column if not exists due text not null default '';

drop policy if exists "app access products" on products;
create policy "app access products" on products for all to anon using (true) with check (true);
drop policy if exists "app access sales" on sales;
create policy "app access sales" on sales for all to anon using (true) with check (true);
drop policy if exists "app access materials" on materials;
create policy "app access materials" on materials for all to anon using (true) with check (true);
drop policy if exists "app access teachers" on teachers;
create policy "app access teachers" on teachers for all to anon using (true) with check (true);
drop policy if exists "app access customers" on customers;
create policy "app access customers" on customers for all to anon using (true) with check (true);
drop policy if exists "app access students" on students;
create policy "app access students" on students for all to anon using (true) with check (true);
drop policy if exists "app access student book records" on student_book_records;
create policy "app access student book records" on student_book_records for all to anon using (true) with check (true);
drop policy if exists "app access loans" on loans;
create policy "app access loans" on loans for all to anon using (true) with check (true);
drop policy if exists "app access cash" on cash_movements;
create policy "app access cash" on cash_movements for all to anon using (true) with check (true);
drop policy if exists "app access purchase orders" on purchase_orders;
create policy "app access purchase orders" on purchase_orders for all to anon using (true) with check (true);
drop policy if exists "app access accounts receivable" on accounts_receivable;
create policy "app access accounts receivable" on accounts_receivable for all to anon using (true) with check (true);
drop policy if exists "app access app settings" on app_settings;
create policy "app access app settings" on app_settings for all to anon using (true) with check (true);
