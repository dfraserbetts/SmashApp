// app/login/page.tsx
"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Temporary fake login — will replace with real auth later.
    router.push("/dashboard");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <section
        style={{
          border: "1px solid #444",
          borderRadius: "8px",
          padding: "2rem",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        <h1 style={{ marginBottom: "1rem" }}>SMASH App Login</h1>
        <form
          onSubmit={handleSubmit}
          style={{ display: "grid", gap: "0.75rem" }}
        >
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Email</span>
            <input
              type="email"
              name="email"
              required
              style={{ padding: "0.5rem" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Password</span>
            <input
              type="password"
              name="password"
              required
              style={{ padding: "0.5rem" }}
            />
          </label>

          <button
            type="submit"
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem",
              cursor: "pointer",
            }}
          >
            Login
          </button>
        </form>
      </section>
    </main>
  );
}

