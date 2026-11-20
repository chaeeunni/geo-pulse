alter table public.orders
  add column is_subscription boolean not null default false,
  add column subscription_started_at timestamptz,
  add column subscription_state text check (subscription_state in ('active', 'payment_failed', 'cancel_scheduled', 'terminated')),
  add column subscription_state_at timestamptz,
  add column subscription_ended_at timestamptz,
  alter column credits drop not null,
  add constraint orders_subscription_credits check (is_subscription = (credits is null));

create index orders_subscription_workspace on public.orders (workspace_id, owner_id, created_at desc)
  where is_subscription;
grant select (is_subscription) on public.orders to authenticated;

alter table public.billing_events
  alter column purchased_at drop not null,
  add column option_id text,
  add column subscription_round integer,
  add column subscription_started_at timestamptz;

create unique index billing_events_subscription_refund on public.billing_events (merchant_uid, refunded_at)
  where event_type = 'subscription_payment.refunded';

create table public.groble_subscription_charges (
  merchant_uid text primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  round integer not null check (round > 0),
  purchased_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > purchased_at),
  unique (order_id, round)
);

alter table public.groble_subscription_charges enable row level security;
revoke all on public.groble_subscription_charges from public, anon, authenticated;
grant all on public.groble_subscription_charges to service_role;

create view public.groble_subscription_periods with (security_invoker = true) as
select charge.*, o.owner_id, o.workspace_id, o.amount,
  least(charge.ends_at, coalesce(o.subscription_ended_at, charge.ends_at)) as access_ends_at,
  coalesce((
    select sum(refund.refund_amount)
    from public.billing_events refund
    where refund.merchant_uid = charge.merchant_uid and refund.event_type = 'subscription_payment.refunded'
      and refund.product_id = o.product_id and refund.option_id = o.option_id
      and refund.amount = o.amount and refund.purchased_at = charge.purchased_at
      and refund.subscription_round = charge.round and refund.subscription_started_at = o.subscription_started_at
  ), 0) as refunded_amount
from public.groble_subscription_charges charge
join public.orders o on o.id = charge.order_id;

revoke all on public.groble_subscription_periods from public, anon, authenticated;
grant select on public.groble_subscription_periods to service_role;

create function public.active_groble_subscription(p_owner uuid, p_workspace uuid, p_order uuid default null)
returns table (ends_at timestamptz) language sql stable set search_path = '' as $$
  select period.access_ends_at from public.groble_subscription_periods period
  where period.owner_id = p_owner and period.workspace_id = p_workspace
    and (p_order is null or period.order_id = p_order)
    and period.refunded_amount < period.amount and period.purchased_at <= now() and period.access_ends_at > now()
  order by period.access_ends_at desc limit 1;
$$;

create function public.open_groble_subscription_order(
  p_id uuid, p_owner uuid, p_workspace uuid, p_ref text, p_product text, p_option text, p_amount bigint
) returns table (order_id uuid, seller_reference text) language plpgsql set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace and owner_id = p_owner for update;
  if not found then return; end if;

  if exists (
    select 1 from public.orders o
    where o.workspace_id = p_workspace and o.owner_id = p_owner and o.is_subscription
      and o.subscription_started_at is not null and (o.subscription_ended_at is null or o.subscription_ended_at > now())
  ) then return; end if;

  return query select o.id, o.seller_reference from public.orders o
    where o.workspace_id = p_workspace and o.owner_id = p_owner and o.is_subscription and o.status = 'pending'
      and o.product_id = p_product and o.option_id = p_option and o.amount = p_amount
    order by o.created_at desc limit 1;
  if found then return; end if;

  insert into public.orders (id, owner_id, workspace_id, seller_reference, product_id, option_id, amount, is_subscription)
    values (p_id, p_owner, p_workspace, p_ref, p_product, p_option, p_amount, true);
  return query select p_id, p_ref;
end;
$$;

create function public.handle_groble_subscription_event(
  p_event text, p_delivery text, p_type text, p_occurred timestamptz, p_merchant text,
  p_ref text, p_product text, p_option text, p_amount bigint, p_activated timestamptz, p_cycle integer,
  p_purchased timestamptz, p_round integer, p_next date, p_refund_amount bigint, p_refunded timestamptz,
  p_terminated timestamptz
) returns void language plpgsql set search_path = '' as $$
declare
  target public.orders%rowtype;
  charge public.groble_subscription_charges%rowtype;
  current_period public.groble_subscription_periods%rowtype;
  paid_until timestamptz;
  state text;
  is_payment boolean := p_type = 'subscription_payment.completed';
  is_refund boolean := p_type = 'subscription_payment.refunded';
begin
  state := case p_type
    when 'subscription_payment.completed' then 'active'
    when 'subscription_payment.failed' then 'payment_failed'
    when 'subscription.cancel_requested' then 'cancel_scheduled'
    when 'subscription.terminated' then 'terminated'
  end;
  if p_cycle is distinct from 1 or p_activated is null or p_activated > p_occurred + interval '5 minutes'
    or (state is null and not is_refund) then return; end if;
  if (is_payment or is_refund) and
    (p_round is null or p_round <= 0 or p_purchased is null or p_purchased < p_activated - interval '5 minutes'
      or p_purchased > p_occurred + interval '5 minutes') then return; end if;
  if is_refund and
    (p_refund_amount is null or p_refund_amount not between 1 and p_amount or
      p_refunded is null or p_refunded < p_purchased or p_refunded > p_occurred + interval '5 minutes') then return; end if;
  if state = 'terminated' and (p_terminated is null or p_terminated < p_activated
    or p_terminated > p_occurred + interval '5 minutes') then return; end if;
  if is_payment then
    paid_until := p_next::timestamp at time zone 'Asia/Seoul';
    if paid_until is null or paid_until <= p_purchased then return; end if;
  end if;

  -- A refund can arrive before its payment. Serializing each transaction lets either arrival order reconcile.
  perform pg_advisory_xact_lock(hashtextextended(p_merchant, 1));
  insert into public.billing_events(id, delivery_key, event_type, merchant_uid, occurred_at, product_id,
    amount, purchased_at, refund_amount, refunded_at, option_id, subscription_round, subscription_started_at)
    values (p_event, p_delivery, p_type, p_merchant, p_occurred, p_product, p_amount, p_purchased,
      p_refund_amount, p_refunded, p_option, p_round, p_activated)
    on conflict do nothing;
  if not found then return; end if;

  if is_refund then
    select * into charge from public.groble_subscription_charges where merchant_uid = p_merchant;
    if not found or charge.round <> p_round or charge.purchased_at <> p_purchased then return; end if;
    select * into target from public.orders where id = charge.order_id for update;
  else
    select * into target from public.orders where seller_reference = p_ref and is_subscription for update;
  end if;
  if not found then return; end if;
  if target.product_id <> p_product or target.option_id <> p_option
    or ((is_payment or is_refund) and target.amount <> p_amount)
    or p_activated < target.created_at - interval '5 minutes'
    or (target.subscription_started_at is not null and target.subscription_started_at <> p_activated) then
    if is_payment then update public.orders set status = 'review' where id = target.id and status = 'pending'; end if;
    return;
  end if;

  if is_payment then
    insert into public.groble_subscription_charges(merchant_uid, order_id, round, purchased_at, ends_at)
      values (p_merchant, target.id, p_round, p_purchased, paid_until) on conflict do nothing;
    if not found and not exists (
      select 1 from public.groble_subscription_charges c where c.merchant_uid = p_merchant and c.order_id = target.id
        and c.round = p_round and c.purchased_at = p_purchased and c.ends_at = paid_until
    ) then return; end if;
  end if;

  if not is_refund then
    update public.orders set subscription_started_at = coalesce(subscription_started_at, p_activated),
      subscription_state = case
        when state = 'terminated' then 'terminated'
        when subscription_ended_at is null and (subscription_state_at is null or p_occurred >= subscription_state_at)
          and (subscription_state is distinct from 'cancel_scheduled' or state = 'cancel_scheduled') then state
        else subscription_state end,
      subscription_state_at = greatest(subscription_state_at, p_occurred),
      subscription_ended_at = case when state = 'terminated'
        then least(subscription_ended_at, p_terminated) else subscription_ended_at end
      where id = target.id;
  end if;

  if is_payment or is_refund then
    select * into current_period from public.groble_subscription_periods
      where order_id = target.id order by round desc limit 1;
    update public.orders set status =
      case when current_period.refunded_amount >= current_period.amount then 'refunded' else 'paid' end
      where id = target.id;
    if is_payment then
      update public.billing_events set resolution = 'applied'
        where merchant_uid = p_merchant and event_type = 'subscription_payment.refunded'
          and product_id = p_product and option_id = p_option and amount = p_amount and purchased_at = p_purchased
          and subscription_round = p_round and subscription_started_at = p_activated;
    end if;
  end if;
  update public.billing_events set resolution = 'applied' where id = p_event;
end;
$$;

-- Keep the legacy webhook intact for previously issued one-time orders.
alter function public.handle_groble_event(text, text, text, text, timestamptz, text, text, text, bigint, timestamptz, bigint, timestamptz)
  rename to handle_groble_one_time_event;

create function public.handle_groble_event(
  p_event text, p_delivery text, p_type text, p_merchant text, p_occurred timestamptz,
  p_ref text, p_product text, p_option text, p_amount bigint, p_purchased timestamptz,
  p_refund_amount bigint, p_refunded timestamptz
) returns void language plpgsql set search_path = '' as $$
begin
  if p_type = 'payment.completed' and exists (
    select 1 from public.orders where seller_reference = p_ref and is_subscription
  ) then return; end if;
  perform public.handle_groble_one_time_event(p_event, p_delivery, p_type, p_merchant, p_occurred, p_ref,
    p_product, p_option, p_amount, p_purchased, p_refund_amount, p_refunded);
end;
$$;

create or replace function public.claim_ai_job(p_id uuid, p_owner uuid, p_workspace uuid, p_action jsonb, p_input jsonb, p_model text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  job public.ai_jobs%rowtype;
  active_pass public.passes%rowtype;
  has_subscription boolean;
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
  select exists (select 1 from public.active_groble_subscription(p_owner, p_workspace)) into has_subscription;
  if not has_subscription then
    select * into active_pass from public.passes
      where workspace_id = p_workspace and owner_id = p_owner and revoked_at is null and expires_at > now() and remaining > 0
      order by expires_at, order_id limit 1 for update;
    if not found then return jsonb_build_object('status', 'no_credit'); end if;
    update public.passes set remaining = remaining - 1 where order_id = active_pass.order_id;
  end if;
  insert into public.ai_jobs(id, owner_id, workspace_id, pass_id, action, input, model)
    values (p_id, p_owner, p_workspace, active_pass.order_id, p_action, p_input, p_model) returning * into job;
  return jsonb_build_object('status', 'claimed', 'input', job.input, 'started_at', to_char(job.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

revoke all on function public.active_groble_subscription(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_groble_subscription_order(uuid, uuid, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.handle_groble_subscription_event(text, text, text, timestamptz, text, text, text, text, bigint, timestamptz, integer, timestamptz, integer, date, bigint, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.handle_groble_event(text, text, text, text, timestamptz, text, text, text, bigint, timestamptz, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.active_groble_subscription(uuid, uuid, uuid) to service_role;
grant execute on function public.open_groble_subscription_order(uuid, uuid, uuid, text, text, text, bigint) to service_role;
grant execute on function public.handle_groble_subscription_event(text, text, text, timestamptz, text, text, text, text, bigint, timestamptz, integer, timestamptz, integer, date, bigint, timestamptz, timestamptz) to service_role;
grant execute on function public.handle_groble_event(text, text, text, text, timestamptz, text, text, text, bigint, timestamptz, bigint, timestamptz) to service_role;
