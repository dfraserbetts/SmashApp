import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadEnvFile(relativePath: string) {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return;

  for (const rawLine of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

async function main() {
  loadLocalEnv();

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const [{ normalizeEmail, upsertUserProfileFromAuthUser }, { prisma }] =
    await Promise.all([
      import("../lib/auth/profileCore"),
      import("../prisma/client"),
    ]);

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

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
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
