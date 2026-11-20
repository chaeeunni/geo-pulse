-- Run after both migrations in a disposable PostgreSQL database.
begin;
set local plpgsql.check_asserts = on;

do $$
declare
  owner uuid := gen_random_uuid();
  brand uuid := gen_random_uuid();
  other_brand uuid := gen_random_uuid();
  monthly_order uuid := gen_random_uuid();
  retry_id uuid := gen_random_uuid();
  refund_order uuid := gen_random_uuid();
  legacy_order uuid := gen_random_uuid();
  job uuid := gen_random_uuid();
  first_paid timestamptz := now() - interval '31 days';
  renewal_paid timestamptz := now() - interval '1 day';
  today date := (now() at time zone 'Asia/Seoul')::date;
  paid_until timestamptz := (today + 29)::timestamp at time zone 'Asia/Seoul';
  result jsonb;
begin
  insert into auth.users (id) values (owner);
  insert into public.workspaces (id, owner_id, brand, data)
    values (brand, owner, '{}', '{}'), (other_brand, owner, '{}', '{}');

  assert (select o.order_id from public.open_groble_subscription_order(
    monthly_order, owner, brand, 'monthly-order', 'monthly-product', 'monthly-option', 3800) o) = monthly_order;
  assert (select o.order_id from public.open_groble_subscription_order(
    retry_id, owner, brand, 'retry', 'monthly-product', 'monthly-option', 3800) o) = monthly_order,
    'concurrent or retried checkout must use the same pending order';
  assert not exists (select 1 from public.active_groble_subscription(owner, brand)),
    'opening checkout does not grant access';
  update public.orders set created_at = first_paid - interval '1 minute' where id = monthly_order;

  perform public.handle_groble_event('wrong-type', 'wrong-type', 'payment.completed', 'wrong-type', now(),
    'monthly-order', 'monthly-product', 'monthly-option', 3800, renewal_paid, null, null);
  assert not exists (select 1 from public.passes p where p.order_id = monthly_order),
    'a legacy payment cannot grant access to a monthly order';

  perform public.handle_groble_subscription_event('first', 'first', 'subscription_payment.completed', first_paid,
    'charge-1', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    first_paid, 1, today - 1, null, null, null);
  assert not exists (select 1 from public.active_groble_subscription(owner, brand)), 'an expired period cannot grant access';

  perform public.handle_groble_subscription_event('wrong-total', 'wrong-total', 'subscription_payment.completed', renewal_paid,
    'wrong-charge', 'monthly-order', 'monthly-product', 'monthly-option', 3799, first_paid, 1,
    renewal_paid, 2, today + 29, null, null, null);
  assert not exists (select 1 from public.active_groble_subscription(owner, brand)), 'wrong amount cannot grant access';

  perform public.handle_groble_subscription_event('renewed', 'renewed', 'subscription_payment.completed', renewal_paid,
    'charge-2', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    renewal_paid, 2, today + 29, null, null, null);
  perform public.handle_groble_subscription_event('renewed-retry', 'renewed-retry', 'subscription_payment.completed', renewal_paid,
    'charge-2', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    renewal_paid, 2, today + 29, null, null, null);
  assert (select count(*) from public.groble_subscription_charges c where c.order_id = monthly_order) = 2;
  assert (select ends_at from public.active_groble_subscription(owner, brand)) = paid_until;
  assert (select ends_at from public.active_groble_subscription(owner, brand, monthly_order)) = paid_until;
  assert not exists (select 1 from public.active_groble_subscription(owner, brand, retry_id));
  assert not exists (select 1 from public.active_groble_subscription(owner, other_brand));
  assert not exists (select 1 from public.active_groble_subscription(gen_random_uuid(), brand));
  assert not exists (select 1 from public.open_groble_subscription_order(
    retry_id, owner, brand, 'retry', 'monthly-product', 'monthly-option', 3800)),
    'active subscription prevents additional checkout';

  insert into public.orders(id, owner_id, workspace_id, seller_reference, product_id, option_id, amount, credits)
    values (legacy_order, owner, brand, 'legacy', 'legacy', 'legacy', 2000, 2);
  perform public.handle_groble_event('legacy-paid', 'legacy-paid', 'payment.completed', 'legacy-charge', now(),
    'legacy', 'legacy', 'legacy', 2000, now(), null, null);
  result := public.claim_ai_job(job, owner, brand, '{}', '{}', 'test');
  assert result->>'status' = 'claimed';
  assert (select j.pass_id is null from public.ai_jobs j where j.id = job);
  assert (select p.remaining from public.passes p where p.order_id = legacy_order) = 2,
    'unlimited execution leaves the existing credit balance intact';
  perform public.finish_ai_job(job, owner, '{}', null);
  assert (public.claim_ai_job(job, owner, brand, '{}', '{}', 'test')->>'status') = 'finished';
  assert (public.claim_ai_job(gen_random_uuid(), owner, brand, '{}', '{}', 'test')->>'status') = 'claimed';

  perform public.handle_groble_subscription_event('refund-old', 'refund-old', 'subscription_payment.refunded', now(),
    'charge-1', null, 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    first_paid, 1, null, 3800, now() - interval '3 hours', null);
  assert (select ends_at from public.active_groble_subscription(owner, brand)) = paid_until,
    'refunding an older charge leaves the current paid period intact';

  perform public.handle_groble_subscription_event('partial', 'partial', 'subscription_payment.refunded', now(),
    'charge-2', null, 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    renewal_paid, 2, null, 1900, now() - interval '2 hours', null);
  perform public.handle_groble_subscription_event('partial-duplicate', 'partial-duplicate', 'subscription_payment.refunded', now(),
    'charge-2', null, 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    renewal_paid, 2, null, 1900, now() - interval '2 hours', null);
  assert (select ends_at from public.active_groble_subscription(owner, brand)) = paid_until;
  assert (select refunded_amount from public.groble_subscription_periods where merchant_uid = 'charge-2') = 1900;

  perform public.handle_groble_subscription_event('fail', 'fail', 'subscription_payment.failed', now() - interval '1 hour',
    'retry-charge', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    null, null, null, null, null, null);
  assert (select subscription_state from public.orders where id = monthly_order) = 'payment_failed';
  assert (select ends_at from public.active_groble_subscription(owner, brand)) = paid_until;
  perform public.handle_groble_subscription_event('cancel', 'cancel', 'subscription.cancel_requested', now() - interval '30 minutes',
    'charge-2', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    null, null, null, null, null, null);
  assert (select subscription_state from public.orders where id = monthly_order) = 'cancel_scheduled';
  assert (select ends_at from public.active_groble_subscription(owner, brand)) = paid_until;
  perform public.handle_groble_subscription_event('end', 'end', 'subscription.terminated', now() - interval '5 minutes',
    'charge-2', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    null, null, null, null, null, now() - interval '5 minutes');
  perform public.handle_groble_subscription_event('late-paid', 'late-paid', 'subscription_payment.completed', renewal_paid,
    'charge-2', 'monthly-order', 'monthly-product', 'monthly-option', 3800, first_paid, 1,
    renewal_paid, 2, today + 29, null, null, null);
  assert (select subscription_state from public.orders where id = monthly_order) = 'terminated';
  assert not exists (select 1 from public.active_groble_subscription(owner, brand));
  assert (public.claim_ai_job(gen_random_uuid(), owner, brand, '{}', '{}', 'test')->>'status') = 'claimed';
  assert (select p.remaining from public.passes p where p.order_id = legacy_order) = 1;

  assert (select o.order_id from public.open_groble_subscription_order(
    refund_order, owner, other_brand, 'refund-order', 'monthly-product', 'monthly-option', 3800) o) = refund_order;
  update public.orders set created_at = renewal_paid - interval '1 minute' where id = refund_order;
  perform public.handle_groble_subscription_event('early-refund', 'early-refund', 'subscription_payment.refunded', now(),
    'refunded-charge', null, 'monthly-product', 'monthly-option', 3800, renewal_paid, 1,
    renewal_paid, 1, null, 3800, now() - interval '1 hour', null);
  perform public.handle_groble_subscription_event('late-first', 'late-first', 'subscription_payment.completed', renewal_paid,
    'refunded-charge', 'refund-order', 'monthly-product', 'monthly-option', 3800, renewal_paid, 1,
    renewal_paid, 1, today + 29, null, null, null);
  assert (select status from public.orders where id = refund_order) = 'refunded';
  assert not exists (select 1 from public.active_groble_subscription(owner, other_brand)),
    'a full refund that arrived first never grants access';
  assert (public.claim_ai_job(gen_random_uuid(), owner, other_brand, '{}', '{}', 'test')->>'status') = 'no_credit';
  assert not has_function_privilege('authenticated', 'public.active_groble_subscription(uuid,uuid,uuid)', 'execute');
  assert not has_table_privilege('authenticated', 'public.groble_subscription_periods', 'select');
end;
$$;

rollback;
