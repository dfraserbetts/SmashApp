-- Reconcile drift for public."UserProfile"."userId":
-- Migration history created it as TEXT, but production/dev DB has UUID.
-- This migration is safe to run on both states.

DO $$
DECLARE
  col_udt_name text;
  invalid_count integer;
  pk_name text;
  pk_on_userid boolean;
BEGIN
  SELECT c.udt_name
    INTO col_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'UserProfile'
    AND c.column_name = 'userId';

  IF col_udt_name IS NULL THEN
    RAISE EXCEPTION 'public.UserProfile.userId was not found';
  END IF;

  IF col_udt_name IN ('text', 'varchar') THEN
    SELECT COUNT(*)::int
      INTO invalid_count
    FROM "UserProfile"
    WHERE "userId"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot convert UserProfile.userId to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE "UserProfile"
      ALTER COLUMN "userId" TYPE UUID USING "userId"::uuid;
  ELSIF col_udt_name <> 'uuid' THEN
    RAISE EXCEPTION 'Unsupported UserProfile.userId type: %', col_udt_name;
  END IF;

  SELECT tc.constraint_name
    INTO pk_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'UserProfile'
    AND tc.constraint_type = 'PRIMARY KEY';

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'UserProfile'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'userId'
  )
    INTO pk_on_userid;

  IF pk_name IS NULL THEN
    ALTER TABLE "UserProfile"
      ADD CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId");
  ELSIF NOT pk_on_userid THEN
    EXECUTE format('ALTER TABLE "UserProfile" DROP CONSTRAINT %I', pk_name);
    ALTER TABLE "UserProfile"
      ADD CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId");
  END IF;
END $$;
