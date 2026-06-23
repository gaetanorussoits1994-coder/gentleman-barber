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
  status: "pending" | "confirmed" | "rejected" | string | null;
};

function formatPhoneForWhatsApp(phone: string) {
  let formattedPhone = phone.replace(/\s/g, "").replace(/\+/g, "");

  if (!formattedPhone.startsWith("39")) {
    formattedPhone = `39${formattedPhone}`;
  }

  return formattedPhone;
}

function buildWhatsAppUrl(appointment: Appointment, status: "confirmed" | "rejected") {
  const message =
    status === "confirmed"
      ? `Ciao ${appointment.name}, la tua prenotazione presso The Gentleman è stata confermata.

Servizio: ${appointment.service}
Data: ${appointment.date}
Ora: ${appointment.time}

Ti aspettiamo.`
      : `Ciao ${appointment.name}, ci dispiace ma la tua prenotazione presso The Gentleman non è disponibile.

Servizio: ${appointment.service}
Data: ${appointment.date}
Ora: ${appointment.time}

Rispondici su WhatsApp per scegliere un altro orario.`;

  return `https://wa.me/${formatPhoneForWhatsApp(appointment.phone)}?text=${encodeURIComponent(message)}`;
}

function getAppointmentStatus(status: Appointment["status"]) {
  return status || "pending";
}

function getStatusBadgeClass(status: Appointment["status"]) {
  const normalizedStatus = getAppointmentStatus(status);

  if (normalizedStatus === "confirmed") {
    return "border-green-500 text-green-400";
  }

  if (normalizedStatus === "rejected") {
    return "border-red-500 text-red-400";
  }

  return "border-yellow-500 text-yellow-500";
}

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

    const realtimeChannel = supabase
      .channel("appointments-admin-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        (payload) => {
          const newAppointment = payload.new as Appointment;

          setAppointments((currentAppointments) => {
            if (currentAppointments.some((item) => item.id === newAppointment.id)) {
              return currentAppointments;
            }

            return [newAppointment, ...currentAppointments];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments" },
        (payload) => {
          const updatedAppointment = payload.new as Appointment;

          setAppointments((currentAppointments) =>
            currentAppointments.map((item) =>
              item.id === updatedAppointment.id ? updatedAppointment : item,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "appointments" },
        (payload) => {
          const deletedAppointment = payload.old as Pick<Appointment, "id">;

          setAppointments((currentAppointments) =>
            currentAppointments.filter((item) => item.id !== deletedAppointment.id),
          );
        },
      )
      .subscribe();

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
      void supabase.removeChannel(realtimeChannel);
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleAppointmentStatus(
    appointment: Appointment,
    status: "confirmed" | "rejected",
  ) {
    setError(null);

    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointment.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setAppointments((currentAppointments) =>
      currentAppointments.map((item) =>
        item.id === appointment.id ? { ...item, status } : item,
      ),
    );

    window.open(buildWhatsAppUrl(appointment, status), "_blank", "noopener,noreferrer");
  }

  async function handleDeleteAppointment(appointment: Appointment) {
    const confirmed = window.confirm(
      `Vuoi eliminare la prenotazione di ${appointment.name}?`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setAppointments((currentAppointments) =>
      currentAppointments.filter((item) => item.id !== appointment.id),
    );
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
              <th className="p-4">Stato</th>
              <th className="p-4">Azioni</th>
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
                <td className="p-4">
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-bold ${getStatusBadgeClass(item.status)}`}
                  >
                    {getAppointmentStatus(item.status)}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleAppointmentStatus(item, "confirmed")}
                      className="rounded-lg bg-yellow-500 px-4 py-2 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={getAppointmentStatus(item.status) === "confirmed"}
                    >
                      Conferma
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAppointmentStatus(item, "rejected")}
                      className="rounded-lg border border-yellow-500 px-4 py-2 font-bold text-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={getAppointmentStatus(item.status) === "rejected"}
                    >
                      Rifiuta
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAppointment(item)}
                      className="rounded-lg border border-red-500 px-4 py-2 font-bold text-red-400"
                    >
                      Elimina
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
