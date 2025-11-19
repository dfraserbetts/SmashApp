// app/dashboard/page.tsx
import Link from "next/link";

const fakeCampaigns = [
  { id: "1", name: "The Iron Citadel" },
  { id: "2", name: "Shadows of the Sanctum" },
];

export default function DashboardPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>Dashboard</h1>
        <p>Welcome back, Warden. Choose a campaign to manage.</p>
        <Link href="/login" style={{ fontSize: "0.875rem" }}>
          ← Back to login
        </Link>
      </header>

      <section>
        <h2>Your Campaigns</h2>
        <ul style={{ marginTop: "0.75rem" }}>
          {fakeCampaigns.map((c) => (
            <li key={c.id} style={{ marginBottom: "0.5rem" }}>
              <Link href={`/campaign/${c.id}`}>{c.name}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

