"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const SERVICES = {
  "Taglio Uomo": 45,
  Barba: 30,
  "Taglio + Barba": 60,
} as const;

type Service = keyof typeof SERVICES;

type ExistingAppointment = {
  time: string;
  service: string;
  status: string | null;
};

const CLOSED_DAY_MESSAGE = "Il locale è chiuso il lunedì.";
const NO_SLOTS_MESSAGE = "Nessuno slot disponibile per la data selezionata.";
const ADMIN_WHATSAPP = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP?.replace(/\D/g, "");

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

function isMonday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() === 1;
}

function getServiceDuration(service: string) {
  return SERVICES[service as Service] ?? 60;
}

function overlaps(
  start: number,
  duration: number,
  appointment: ExistingAppointment,
) {
  const appointmentStart = timeToMinutes(appointment.time);
  const appointmentEnd =
    appointmentStart + getServiceDuration(appointment.service);

  return start < appointmentEnd && start + duration > appointmentStart;
}

function createAvailableSlots(
  service: Service,
  appointments: ExistingAppointment[],
) {
  const duration = SERVICES[service];
  const shifts = [
    [8 * 60, 12 * 60 + 30],
    [13 * 60 + 30, 18 * 60],
  ];

  return shifts.flatMap(([shiftStart, shiftEnd]) => {
    const slots: string[] = [];

    for (let start = shiftStart; start + duration <= shiftEnd; start += 15) {
      const occupied = appointments.some(
        (appointment) =>
          appointment.status !== "rejected" &&
          overlaps(start, duration, appointment),
      );

      if (!occupied) {
        slots.push(minutesToTime(start));
      }
    }

    return slots;
  });
}

function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWhatsAppUrl(details: {
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  notes: string;
}) {
  const message = `Nuova prenotazione The Gentleman

Nome: ${details.name}
Telefono: ${details.phone}
Servizio: ${details.service}
Data: ${details.date}
Ora: ${details.time}
Note: ${details.notes || "Nessuna"}`;
  const recipient = ADMIN_WHATSAPP ? `/${ADMIN_WHATSAPP}` : "";

  return `https://wa.me${recipient}?text=${encodeURIComponent(message)}`;
}

export default function BookingPage() {
  const [service, setService] = useState<Service>("Taglio Uomo");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [appointments, setAppointments] = useState<ExistingAppointment[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAppointments() {
      setTime("");
      setAppointments([]);

      if (!date || isMonday(date)) {
        setMessage(date ? CLOSED_DAY_MESSAGE : "");
        return;
      }

      setMessage("");
      setLoadingSlots(true);

      const { data, error } = await supabase
        .from("appointments")
        .select("time, service, status")
        .eq("date", date);

      if (!active) {
        return;
      }

      setLoadingSlots(false);

      if (error) {
        setMessage("Impossibile caricare gli slot disponibili.");
        return;
      }

      setAppointments((data ?? []) as ExistingAppointment[]);
    }

    void loadAppointments();

    return () => {
      active = false;
    };
  }, [date]);

  const availableSlots = useMemo(
    () => createAvailableSlots(service, appointments),
    [service, appointments],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!date || isMonday(date)) {
      setMessage(CLOSED_DAY_MESSAGE);
      return;
    }

    if (!time || !availableSlots.includes(time)) {
      setMessage("Lo slot selezionato non è più disponibile.");
      return;
    }

    setSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name"));
    const phone = String(formData.get("phone"));
    const notes = String(formData.get("notes") ?? "");

    const { data: currentAppointments, error: availabilityError } =
      await supabase
        .from("appointments")
        .select("time, service, status")
        .eq("date", date);

    if (availabilityError) {
      setMessage("Impossibile verificare la disponibilità dello slot.");
      setSubmitting(false);
      return;
    }

    const stillAvailable = createAvailableSlots(
      service,
      (currentAppointments ?? []) as ExistingAppointment[],
    ).includes(time);

    if (!stillAvailable) {
      setAppointments(
        (currentAppointments ?? []) as ExistingAppointment[],
      );
      setTime("");
      setMessage("Lo slot selezionato non è più disponibile.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("appointments").insert([
      {
        name,
        phone,
        service,
        date,
        time,
        notes,
        status: "pending",
      },
    ]);

    setSubmitting(false);

    if (error) {
      setMessage(error.message || "Errore durante l'invio della prenotazione.");
      return;
    }

    setMessage("Prenotazione inviata con successo!");
    form.reset();
    setService("Taglio Uomo");
    setDate("");
    setTime("");
    window.open(
      buildWhatsAppUrl({ name, phone, service, date, time, notes }),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-500"
        >
          ← Torna alla home
        </Link>

        <div className="my-10 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-yellow-500">
            The Gentleman
          </p>
          <h1 className="mt-3 text-4xl font-extrabold md:text-5xl">
            Prenota il tuo appuntamento
          </h1>
          <p className="mt-4 text-gray-400">
            Aperto da martedì a domenica, 08:00-12:30 e 13:30-18:00.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-5 rounded-3xl border border-yellow-500/40 bg-zinc-950 p-6 shadow-[0_0_45px_rgba(234,179,8,0.1)] sm:p-9"
        >
          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Nome</span>
            <input
              name="name"
              required
              autoComplete="name"
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black"
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Telefono</span>
            <input
              name="phone"
              required
              type="tel"
              autoComplete="tel"
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black"
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Servizio</span>
            <select
              name="service"
              value={service}
              onChange={(event) => {
                setService(event.target.value as Service);
                setTime("");
              }}
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black"
            >
              {Object.entries(SERVICES).map(([name, duration]) => (
                <option key={name} value={name}>
                  {name} — {duration} minuti
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Data</span>
            <input
              name="date"
              required
              type="date"
              min={getToday()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black"
            />
          </label>

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">
              Slot disponibile
            </span>
            <select
              name="time"
              required
              value={time}
              onChange={(event) => setTime(event.target.value)}
              disabled={!date || isMonday(date) || loadingSlots}
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              <option value="">
                {loadingSlots
                  ? "Caricamento..."
                  : date && !isMonday(date) && availableSlots.length === 0
                    ? NO_SLOTS_MESSAGE
                    : "Seleziona un orario"}
              </option>
              {availableSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Note</span>
            <textarea
              name="notes"
              rows={4}
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black"
            />
          </label>

          <button
            disabled={submitting || loadingSlots}
            className="rounded-xl bg-yellow-500 p-4 font-bold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Invio..." : "Invia Prenotazione"}
          </button>

          {message && (
            <p className="text-center font-medium text-yellow-500">{message}</p>
          )}
        </form>
      </div>
    </main>
  );
}
