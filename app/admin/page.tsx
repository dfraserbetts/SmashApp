// app/admin/page.tsx
import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm opacity-80">
        Internal tools. If you can see this, your <code>isAdmin</code> flag is
        working.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="text-lg font-medium">Core Ops</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            <li>
              <Link className="underline" href="/admin/forge-values">
                Forge Values (unified)
              </Link>
            </li>
            <li>
              <Link className="underline" href="/admin/monster-traits">
                Monster Traits
              </Link>
            </li>
            <li>
              <Link className="underline" href="/admin/limit-break-templates">
                Limit Break Templates
              </Link>
            </li>
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="text-lg font-medium">Game Ops</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            <li>
              <Link className="underline" href="/admin/campaigns">
                Campaign Inspector
              </Link>
            </li>
            <li>
              <Link className="underline" href="/admin/combat-tuning">
                Combat Tuning
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
