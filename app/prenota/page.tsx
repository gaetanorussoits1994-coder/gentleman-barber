"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Service = {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number;
  active: boolean;
};

type Operator = {
  id: string;
  name: string;
  active: boolean;
};

type OperatorService = {
  operator_id: string;
  service_id: string;
};

type ExistingAppointment = {
  time: string;
  service: string;
  service_id: string | null;
  status: string | null;
};

type DailySlot = {
  time: string;
  available: boolean;
};

const LEGACY_SERVICE_DURATIONS: Record<string, number> = {
  "Taglio Uomo": 45,
  Barba: 30,
  "Taglio + Barba": 60,
};

const CLOSED_DAY_MESSAGE = "Il locale è chiuso il lunedì.";
const UNAVAILABLE_SLOT_MESSAGE =
  "Questo orario non è più disponibile. Scegli un altro slot.";
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

function getAppointmentDuration(
  appointment: ExistingAppointment,
  services: Service[],
) {
  const linkedService = services.find(
    (service) => service.id === appointment.service_id,
  );

  return (
    linkedService?.duration_minutes ??
    LEGACY_SERVICE_DURATIONS[appointment.service] ??
    60
  );
}

function createDailySlots(
  duration: number,
  appointments: ExistingAppointment[],
  services: Service[],
): DailySlot[] {
  const shifts = [
    [8 * 60, 12 * 60 + 30],
    [13 * 60 + 30, 18 * 60],
  ];

  return shifts.flatMap(([shiftStart, shiftEnd]) => {
    const slots: DailySlot[] = [];

    for (let start = shiftStart; start + duration <= shiftEnd; start += 15) {
      const occupied = appointments.some((appointment) => {
        if (appointment.status === "rejected") {
          return false;
        }

        const appointmentStart = timeToMinutes(appointment.time);
        const appointmentEnd =
          appointmentStart + getAppointmentDuration(appointment, services);

        return start < appointmentEnd && start + duration > appointmentStart;
      });

      slots.push({
        time: minutesToTime(start),
        available: !occupied,
      });
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
  operator: string;
  date: string;
  time: string;
  notes: string;
}) {
  const message = `Nuova richiesta prenotazione:
Nome: ${details.name}
Telefono: ${details.phone}
Servizio: ${details.service}
Operatore: ${details.operator}
Data: ${details.date}
Ora: ${details.time}
Note: ${details.notes || "Nessuna"}`;
  const recipient = ADMIN_WHATSAPP ? `/${ADMIN_WHATSAPP}` : "";

  return `https://wa.me${recipient}?text=${encodeURIComponent(message)}`;
}

export default function BookingPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [associations, setAssociations] = useState<OperatorService[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [appointments, setAppointments] = useState<ExistingAppointment[]>([]);
  const [loadingConfiguration, setLoadingConfiguration] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadConfiguration() {
      const [servicesResult, operatorsResult, associationsResult] =
        await Promise.all([
          supabase
            .from("services")
            .select("id, name, price, duration_minutes, active")
            .eq("active", true)
            .order("name"),
          supabase
            .from("operators")
            .select("id, name, active")
            .eq("active", true)
            .order("name"),
          supabase
            .from("operator_services")
            .select("operator_id, service_id"),
        ]);

      if (!active) {
        return;
      }

      setLoadingConfiguration(false);

      const configurationError =
        servicesResult.error ||
        operatorsResult.error ||
        associationsResult.error;

      if (configurationError) {
        setMessage(
          `Configurazione non disponibile: ${configurationError.message}`,
        );
        return;
      }

      setServices((servicesResult.data ?? []) as Service[]);
      setOperators((operatorsResult.data ?? []) as Operator[]);
      setAssociations(
        (associationsResult.data ?? []) as OperatorService[],
      );
    }

    void loadConfiguration();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAppointments() {
      setTime("");
      setAppointments([]);

      if (!operatorId || !date || isMonday(date)) {
        setMessage(date && isMonday(date) ? CLOSED_DAY_MESSAGE : "");
        return;
      }

      setMessage("");
      setLoadingSlots(true);

      const { data, error } = await supabase
        .from("appointments")
        .select("time, service, service_id, status")
        .eq("date", date)
        .eq("operator_id", operatorId);

      if (!active) {
        return;
      }

      setLoadingSlots(false);

      if (error) {
        setMessage(`Impossibile caricare gli orari: ${error.message}`);
        return;
      }

      setAppointments((data ?? []) as ExistingAppointment[]);
    }

    void loadAppointments();

    return () => {
      active = false;
    };
  }, [date, operatorId]);

  const selectedService =
    services.find((service) => service.id === serviceId) ?? null;
  const selectedOperator =
    operators.find((operator) => operator.id === operatorId) ?? null;
  const availableOperators = operators.filter((operator) =>
    associations.some(
      (association) =>
        association.operator_id === operator.id &&
        association.service_id === serviceId,
    ),
  );
  const dailySlots = useMemo(
    () =>
      selectedService
        ? createDailySlots(
            selectedService.duration_minutes,
            appointments,
            services,
          )
        : [],
    [appointments, selectedService, services],
  );
  const availableSlots = dailySlots.filter((slot) => slot.available);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!selectedService || !selectedOperator) {
      setMessage("Seleziona servizio e operatore.");
      return;
    }

    if (!date || isMonday(date)) {
      setMessage(CLOSED_DAY_MESSAGE);
      return;
    }

    if (!time || !availableSlots.some((slot) => slot.time === time)) {
      setMessage(UNAVAILABLE_SLOT_MESSAGE);
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
        .select("time, service, service_id, status")
        .eq("date", date)
        .eq("operator_id", selectedOperator.id);

    if (availabilityError) {
      setMessage("Impossibile verificare la disponibilità dello slot.");
      setSubmitting(false);
      return;
    }

    const updatedAppointments =
      (currentAppointments ?? []) as ExistingAppointment[];
    const stillAvailable = createDailySlots(
      selectedService.duration_minutes,
      updatedAppointments,
      services,
    ).some((slot) => slot.time === time && slot.available);

    if (!stillAvailable) {
      setAppointments(updatedAppointments);
      setTime("");
      setMessage(UNAVAILABLE_SLOT_MESSAGE);
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("appointments").insert([
      {
        name,
        phone,
        service: selectedService.name,
        service_id: selectedService.id,
        operator_id: selectedOperator.id,
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
    setServiceId("");
    setOperatorId("");
    setDate("");
    setTime("");
    setAppointments([]);
    window.open(
      buildWhatsAppUrl({
        name,
        phone,
        service: selectedService.name,
        operator: selectedOperator.name,
        date,
        time,
        notes,
      }),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl">
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
            Scegli servizio, operatore e uno degli orari disponibili.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 rounded-3xl border border-yellow-500/40 bg-zinc-950 p-6 shadow-[0_0_45px_rgba(234,179,8,0.1)] sm:p-9"
        >
          <div className="grid gap-5 sm:grid-cols-2">
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
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-semibold text-yellow-500">Servizio</span>
              <select
                name="service_id"
                required
                value={serviceId}
                disabled={loadingConfiguration}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  setOperatorId("");
                  setDate("");
                  setTime("");
                }}
                className="rounded-xl border border-zinc-700 bg-white p-4 text-black disabled:bg-zinc-300"
              >
                <option value="">
                  {loadingConfiguration
                    ? "Caricamento..."
                    : "Seleziona servizio"}
                </option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} — {service.duration_minutes} min
                    {service.price != null ? ` — €${service.price}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="font-semibold text-yellow-500">Operatore</span>
              <select
                name="operator_id"
                required
                value={operatorId}
                disabled={!serviceId}
                onChange={(event) => {
                  setOperatorId(event.target.value);
                  setDate("");
                  setTime("");
                }}
                className="rounded-xl border border-zinc-700 bg-white p-4 text-black disabled:bg-zinc-300"
              >
                <option value="">
                  {!serviceId
                    ? "Seleziona prima il servizio"
                    : availableOperators.length
                      ? "Seleziona operatore"
                      : "Nessun operatore disponibile"}
                </option>
                {availableOperators.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Data</span>
            <input
              name="date"
              required
              type="date"
              min={getToday()}
              value={date}
              disabled={!operatorId}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black disabled:bg-zinc-300"
            />
          </label>

          <fieldset className="grid gap-3">
            <legend className="font-semibold text-yellow-500">
              Orari della giornata
            </legend>

            {!date && (
              <p className="text-sm text-gray-400">
                Seleziona servizio, operatore e data per vedere gli orari.
              </p>
            )}

            {loadingSlots && <p className="text-gray-400">Caricamento...</p>}

            {date && isMonday(date) && (
              <p className="font-medium text-yellow-500">
                {CLOSED_DAY_MESSAGE}
              </p>
            )}

            {date &&
              !isMonday(date) &&
              !loadingSlots &&
              availableSlots.length === 0 && (
                <p className="font-medium text-yellow-500">
                  Nessun orario disponibile per questa data.
                </p>
              )}

            {date && !isMonday(date) && !loadingSlots && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {dailySlots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => setTime(slot.time)}
                    className={
                      slot.available
                        ? `rounded-lg border px-2 py-3 text-sm font-bold transition ${
                            time === slot.time
                              ? "border-yellow-300 bg-yellow-300 text-black ring-2 ring-yellow-100"
                              : "border-yellow-500 bg-yellow-500 text-black hover:bg-yellow-400"
                          }`
                        : "cursor-not-allowed rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-zinc-400"
                    }
                  >
                    {slot.available ? slot.time : `${slot.time} Occupato`}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <input name="time" type="hidden" value={time} />

          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">Note</span>
            <textarea
              name="notes"
              rows={4}
              className="rounded-xl border border-zinc-700 bg-white p-4 text-black"
            />
          </label>

          <button
            disabled={submitting || loadingSlots || !time}
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
