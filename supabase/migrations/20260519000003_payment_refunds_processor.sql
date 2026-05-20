-- payment_refunds.processor_refund_id
--
-- payment_refunds.stripe_refund_id is a Stripe-specific column carried over
-- from the single-processor world. Helcim refunds return a numeric
-- transactionId; rather than overload the Stripe column name, add a generic
-- id column and backfill the existing Stripe rows.
--
-- We keep stripe_refund_id in place as a back-compat read alias so any
-- straggling code path (or external journal export) doesn't lose the
-- linkage. A follow-up migration can drop it once nothing reads it.

alter table public.payment_refunds
  add column processor_refund_id text;

create index if not exists payment_refunds_processor_refund_idx
  on public.payment_refunds (processor_refund_id);

update public.payment_refunds
   set processor_refund_id = stripe_refund_id
 where processor_refund_id is null
   and stripe_refund_id is not null;
