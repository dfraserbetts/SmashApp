export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm opacity-80">
        Internal tools. If you can see this, your <code>isAdmin</code> flag is
        working.
      </p>
      <p className="text-sm text-zinc-400">Use the navigation above to open an admin tool.</p>
    </div>
  );
}
