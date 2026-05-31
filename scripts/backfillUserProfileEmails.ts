import { createClient } from "@supabase/supabase-js";

import {
  normalizeEmail,
  upsertUserProfileFromAuthUser,
} from "@/lib/auth/profileCore";
import { prisma } from "@/prisma/client";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  let page = 1;
  const perPage = 1000;
  let scanned = 0;
  let updated = 0;
  let skippedMissingEmail = 0;
  let failures = 0;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list Supabase auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      scanned += 1;

      if (!normalizeEmail(user.email)) {
        skippedMissingEmail += 1;
        continue;
      }

      try {
        await upsertUserProfileFromAuthUser(user);
        updated += 1;
      } catch (error) {
        failures += 1;
        console.error(
          `Failed to sync profile for ${user.id}: ${(error as Error).message}`,
        );
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  console.log(
    [
      `users scanned: ${scanned}`,
      `profiles updated/created: ${updated}`,
      `users skipped missing email: ${skippedMissingEmail}`,
      `failures: ${failures}`,
    ].join("\n"),
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
