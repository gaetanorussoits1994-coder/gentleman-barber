"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Appointment = {
  id: string | number;
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  notes: string | null;
};

export default function AdminPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadAppointments() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data, error: appointmentsError } = await supabase
        .from("appointments")
        .select("*")
        .order("created_at", { ascending: false });

      if (!active) {
        return;
      }

      setAppointments((data ?? []) as Appointment[]);
      setError(appointmentsError?.message ?? null);
      setLoading(false);
    }

    void loadAppointments();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-500">
        Caricamento...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-bold text-yellow-500">
          Prenotazioni - The Gentleman
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-yellow-500 px-4 py-2 font-bold text-yellow-500"
        >
          Logout
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-900 p-4">
          Errore caricamento prenotazioni: {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-zinc-900">
          <thead>
            <tr className="border-b border-zinc-700 text-left">
              <th className="p-4">Nome</th>
              <th className="p-4">Telefono</th>
              <th className="p-4">Servizio</th>
              <th className="p-4">Data</th>
              <th className="p-4">Ora</th>
              <th className="p-4">Note</th>
            </tr>
          </thead>

          <tbody>
            {appointments.map((item) => (
              <tr key={item.id} className="border-b border-zinc-800">
                <td className="p-4">{item.name}</td>
                <td className="p-4">{item.phone}</td>
                <td className="p-4">{item.service}</td>
                <td className="p-4">{item.date}</td>
                <td className="p-4">{item.time}</td>
                <td className="p-4">{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
