"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email o password non validi");
      setLoading(false);
      return;
    }

    router.push("/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-8 text-white">
      <div className="w-full max-w-md rounded-xl bg-zinc-900 p-8 shadow-2xl">
        <h1 className="mb-2 text-4xl font-bold text-yellow-500">
          The Gentleman
        </h1>
        <p className="mb-8 text-zinc-400">Accesso amministratore</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block font-semibold">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-zinc-700 bg-black p-3 text-white outline-none focus:border-yellow-500"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block font-semibold">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-700 bg-black p-3 text-white outline-none focus:border-yellow-500"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-950 p-3 text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-yellow-500 p-3 font-bold text-black disabled:opacity-60"
          >
            {loading ? "Accesso..." : "Accedi"}
          </button>
        </form>
      </div>
    </main>
  );
}
