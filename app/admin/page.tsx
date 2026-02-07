// app/admin/page.tsx
export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm opacity-80">
        Internal tools. If you can see this, your <code>isAdmin</code> flag is
        working.
      </p>

      <div className="rounded-lg border p-4">
        <h2 className="text-lg font-medium">Next</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">
          <li>
            <a className="underline" href="/admin/forge-values">
              Forge Values (unified)
            </a>
          </li>
          <li>
            <a className="underline" href="/admin/weapon-attributes">
              Weapon Attributes (legacy page)
            </a>
          </li>
          <li>
            <a className="underline" href="/admin/limit-break-templates">
              Limit Break Templates
            </a>
          </li>
          <li>Descriptor Rules editor (draft/publish)</li>
        </ul>
      </div>
    </div>
  );
}
