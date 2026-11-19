create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand jsonb not null,
  data jsonb not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index workspaces_owner on public.workspaces (owner_id, created_at);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  workspace_id uuid not null,
  seller_reference text not null unique,
  merchant_uid text unique,
  purchased_at timestamptz,
  product_id text not null,
  option_id text not null,
  amount bigint not null check (amount > 0),
  credits integer not null check (credits > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'review', 'refunded')),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, owner_id) references public.workspaces(id, owner_id) on delete cascade,
  unique (id, workspace_id, owner_id)
);
create index orders_owner on public.orders (owner_id, created_at desc);
create table public.passes (
  order_id uuid primary key,
  owner_id uuid not null,
  workspace_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  remaining integer not null check (remaining >= 0),
  foreign key (order_id, workspace_id, owner_id) references public.orders (id, workspace_id, owner_id) on delete cascade
);
create index passes_workspace on public.passes (workspace_id, expires_at) where revoked_at is null;
create table public.billing_events (
  id text primary key,
  delivery_key text not null unique,
  event_type text not null,
  merchant_uid text not null,
  occurred_at timestamptz not null,
  product_id text not null,
  amount bigint not null,
  purchased_at timestamptz not null,
  refund_amount bigint,
  refunded_at timestamptz,
  resolution text not null default 'review'
);
create index billing_events_transaction on public.billing_events (merchant_uid, event_type);
create table public.ai_jobs (
  id uuid primary key,
  owner_id uuid not null,
  workspace_id uuid not null,
  pass_id uuid references public.passes(order_id) on delete cascade,
  action jsonb not null,
  input jsonb not null,
  model text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text,
  foreign key (workspace_id, owner_id) references public.workspaces(id, owner_id) on delete cascade
);

alter table public.workspaces enable row level security;
alter table public.orders enable row level security;
alter table public.passes enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_jobs enable row level security;

revoke all on public.workspaces, public.orders, public.passes, public.billing_events, public.ai_jobs from anon, authenticated;
grant select (id, brand, data, created_at) on public.workspaces to authenticated;
grant select (id, workspace_id, status, created_at) on public.orders to authenticated;
grant select (workspace_id, expires_at, revoked_at, remaining) on public.passes to authenticated;
grant all on public.workspaces, public.orders, public.passes, public.billing_events, public.ai_jobs to service_role;
create policy workspace_owner_read on public.workspaces for select to authenticated using (owner_id = (select auth.uid()));
create policy orders_owner_read on public.orders for select to authenticated using (owner_id = (select auth.uid()));
create policy passes_owner_read on public.passes for select to authenticated using (owner_id = (select auth.uid()));

create function public.claim_ai_job(p_id uuid, p_owner uuid, p_workspace uuid, p_action jsonb, p_input jsonb, p_model text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  job public.ai_jobs%rowtype;
  active_pass public.passes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into job from public.ai_jobs where id = p_id;
  if found then
    if job.owner_id <> p_owner or job.workspace_id <> p_workspace or job.action <> p_action then
      return jsonb_build_object('status', 'conflict');
    end if;
    if job.finished_at is null then
      if job.started_at > now() - interval '2 minutes' then return jsonb_build_object('status', 'busy'); end if;
      update public.ai_jobs set finished_at = now(), error = '작업 시간이 초과됐습니다. 새로 실행해 주세요.'
        where id = job.id and finished_at is null returning * into job;
      if found then
        update public.passes set remaining = remaining + 1 where order_id = job.pass_id;
      else
        select * into job from public.ai_jobs where id = p_id;
      end if;
    end if;
    return jsonb_build_object('status', 'finished', 'input', job.input, 'result', job.result, 'error', job.error);
  end if;
  select * into active_pass from public.passes
    where workspace_id = p_workspace and owner_id = p_owner and revoked_at is null and expires_at > now() and remaining > 0
    order by expires_at, order_id limit 1 for update;
  if not found then return jsonb_build_object('status', 'no_credit'); end if;
  update public.passes set remaining = remaining - 1 where order_id = active_pass.order_id;
  insert into public.ai_jobs(id, owner_id, workspace_id, pass_id, action, input, model)
    values (p_id, p_owner, p_workspace, active_pass.order_id, p_action, p_input, p_model) returning * into job;
  return jsonb_build_object('status', 'claimed', 'input', job.input, 'started_at', to_char(job.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

create function public.finish_ai_job(p_id uuid, p_owner uuid, p_result jsonb, p_error text)
returns void language plpgsql set search_path = '' as $$
declare
  job public.ai_jobs%rowtype;
begin
  update public.ai_jobs set result = p_result, error = p_error, finished_at = now()
    where id = p_id and owner_id = p_owner and finished_at is null returning * into job;
  if found and p_error is not null then
    update public.passes set remaining = remaining + 1 where order_id = job.pass_id;
  end if;
end;
$$;

create function public.handle_groble_event(
  p_event text, p_delivery text, p_type text, p_merchant text, p_occurred timestamptz,
  p_ref text, p_product text, p_option text, p_amount bigint, p_purchased timestamptz,
  p_refund_amount bigint, p_refunded timestamptz
) returns void language plpgsql set search_path = '' as $$
declare
  target public.orders%rowtype;
  matching_refund timestamptz;
  is_completion boolean := p_type = 'payment.completed';
begin
  if p_type not in ('payment.completed', 'payment.refunded') then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_merchant, 1));
  insert into public.billing_events(id, delivery_key, event_type, merchant_uid, occurred_at, product_id,
    amount, purchased_at, refund_amount, refunded_at)
  values (p_event, p_delivery, p_type, p_merchant, p_occurred, p_product, p_amount, p_purchased, p_refund_amount, p_refunded)
  on conflict do nothing;
  if not found then return; end if;

  if is_completion then
    select * into target from public.orders where seller_reference = p_ref for update;
  else
    select * into target from public.orders where merchant_uid = p_merchant for update;
  end if;
  if not found then return; end if;
  if target.product_id <> p_product or target.amount <> p_amount
     or (is_completion and (target.option_id is distinct from p_option or p_purchased < target.created_at - interval '5 minutes'))
     or (target.merchant_uid is not null and (target.merchant_uid <> p_merchant or target.purchased_at <> p_purchased))
     or (is_completion and exists (select 1 from public.orders where merchant_uid = p_merchant and id <> target.id)) then
    update public.orders set status = 'review' where id = target.id and status = 'pending';
    return;
  end if;

  if not is_completion then
    if p_refund_amount is null or p_refund_amount <= 0 or p_refund_amount > p_amount or p_refunded < p_purchased then return; end if;
    update public.passes set revoked_at = coalesce(revoked_at, p_refunded) where order_id = target.id;
    update public.orders set status = 'refunded' where id = target.id;
    update public.billing_events set resolution = 'applied' where id = p_event;
    return;
  end if;

  select min(refunded_at) into matching_refund from public.billing_events
    where merchant_uid = p_merchant and event_type = 'payment.refunded'
      and product_id = p_product and amount = p_amount and purchased_at = p_purchased
      and refund_amount between 1 and p_amount and refunded_at >= p_purchased;
  insert into public.passes(order_id, workspace_id, owner_id, expires_at, remaining, revoked_at)
    values (target.id, target.workspace_id, target.owner_id, p_purchased + interval '720 hours', target.credits, matching_refund)
    on conflict (order_id) do nothing;
  update public.orders set merchant_uid = p_merchant, purchased_at = p_purchased,
    status = case when matching_refund is not null or status = 'refunded' then 'refunded' else 'paid' end
    where id = target.id;
  update public.billing_events set resolution = 'applied' where id = p_event or
    (merchant_uid = p_merchant and event_type = 'payment.refunded' and product_id = p_product
      and amount = p_amount and purchased_at = p_purchased and refund_amount between 1 and p_amount and refunded_at >= p_purchased);
end;
$$;

revoke all on function public.claim_ai_job(uuid, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.finish_ai_job(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.handle_groble_event(text, text, text, text, timestamptz, text, text, text, bigint, timestamptz, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_ai_job(uuid, uuid, uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.finish_ai_job(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.handle_groble_event(text, text, text, text, timestamptz, text, text, text, bigint, timestamptz, bigint, timestamptz) to service_role;
