-- Ledger: every transaction must balance (checked at commit).
CREATE OR REPLACE FUNCTION ledger_check_balance() RETURNS trigger AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT coalesce(sum(debit),0), coalesce(sum(credit),0) INTO d, c FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF d <> c THEN
    RAISE EXCEPTION 'unbalanced ledger transaction % (debit %, credit %)', NEW.transaction_id, d, c;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_balance AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balance();
--> statement-breakpoint
-- Append-only tables: no UPDATE or DELETE, ever.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER ledger_tx_append_only BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER booking_events_append_only BEFORE UPDATE OR DELETE ON booking_events FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER settings_history_append_only BEFORE UPDATE OR DELETE ON settings_history FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
-- Consents: never deleted; the only allowed change is setting withdrawn_at once.
CREATE OR REPLACE FUNCTION consents_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'consents are never deleted'; END IF;
  IF OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
     OR (to_jsonb(NEW) - 'withdrawn_at') <> (to_jsonb(OLD) - 'withdrawn_at') THEN
    RAISE EXCEPTION 'consents can only be withdrawn';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER consents_guard BEFORE UPDATE OR DELETE ON consents FOR EACH ROW EXECUTE FUNCTION consents_guard();
