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
  created_at: string;
};

type Operator = {
  id: string;
  name: string;
  bio: string | null;
  image_url: string | null;
  specialties: string | null;
  active: boolean;
};

type OperatorServiceWithOperator = {
  operators: Operator | Operator[] | null;
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

type BookingConfirmation = {
  name: string;
  service: string;
  operator: string;
  date: string;
  time: string;
  duration: number;
  price: number | null;
};

const LEGACY_SERVICE_DURATIONS: Record<string, number> = {
  "Taglio Uomo": 45,
  Barba: 30,
  "Taglio + Barba": 60,
};

const CLOSED_DAY_MESSAGE = "Il locale è chiuso il lunedì.";
const UNAVAILABLE_SLOT_MESSAGE =
  "Questo orario non è più disponibile. Scegli un altro slot.";

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

function formatPrice(price: number | null) {
  if (price == null) {
    return null;
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(price);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatItalianDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export default function BookingPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [appointments, setAppointments] = useState<ExistingAppointment[]>([]);
  const [loadingConfiguration, setLoadingConfiguration] = useState(true);
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] =
    useState<BookingConfirmation | null>(null);

  useEffect(() => {
    let active = true;

    async function loadConfiguration() {
      const servicesResult = await supabase
        .from("services")
        .select("id, name, price, duration_minutes, active, created_at")
        .eq("active", true)
        .order("name");

      if (!active) {
        return;
      }

      setLoadingConfiguration(false);

      if (servicesResult.error) {
        setMessage(
          `Configurazione non disponibile: ${servicesResult.error.message}`,
        );
        return;
      }

      setServices((servicesResult.data ?? []) as Service[]);
    }

    void loadConfiguration();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOperatorsForService() {
      setOperators([]);
      setOperatorId("");
      setDate("");
      setTime("");
      setAppointments([]);

      if (!serviceId) {
        setLoadingOperators(false);
        return;
      }

      setLoadingOperators(true);
      setMessage("");

      const { data, error } = await supabase
        .from("operator_services")
        .select(
          "operators!inner(id, name, bio, image_url, specialties, active)",
        )
        .eq("service_id", serviceId)
        .eq("operators.active", true);

      if (!active) {
        return;
      }

      setLoadingOperators(false);

      if (error) {
        setMessage(`Impossibile caricare gli operatori: ${error.message}`);
        return;
      }

      const availableOperators = (
        (data ?? []) as OperatorServiceWithOperator[]
      )
        .flatMap((association) =>
          Array.isArray(association.operators)
            ? association.operators
            : association.operators
              ? [association.operators]
              : [],
        )
        .filter((operator) => operator.active)
        .sort((first, second) => first.name.localeCompare(second.name));

      setOperators(availableOperators);
      setOperatorId(availableOperators[0]?.id ?? "");
    }

    void loadOperatorsForService();

    return () => {
      active = false;
    };
  }, [serviceId]);

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
  const availableOperators = operators;
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
      setMessage(
        `Impossibile verificare la disponibilità dello slot: ${availabilityError.message}`,
      );
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
      setMessage(
        `Impossibile salvare la prenotazione: ${
          error.message || "errore sconosciuto"
        }`,
      );
      return;
    }

    setConfirmation({
      name,
      service: selectedService.name,
      operator: selectedOperator.name,
      date,
      time,
      duration: selectedService.duration_minutes,
      price: selectedService.price,
    });
    form.reset();
    setServiceId("");
    setOperatorId("");
    setDate("");
    setTime("");
    setAppointments([]);
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

        {confirmation ? (
          <section className="my-10 rounded-3xl border border-yellow-500/50 bg-zinc-950 p-6 text-center shadow-[0_0_45px_rgba(234,179,8,0.12)] sm:p-10">
            <div
              aria-hidden="true"
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-yellow-500 bg-yellow-500/10 text-3xl text-yellow-500"
            >
              ✓
            </div>
            <p className="mt-6 text-sm uppercase tracking-[0.35em] text-yellow-500">
              The Gentleman
            </p>
            <h1 className="mt-3 text-4xl font-extrabold">
              Richiesta inviata
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-gray-400">
              Richiesta inviata. Attendi conferma dal barber shop.
            </p>

            <dl className="mx-auto mt-8 grid max-w-xl gap-4 rounded-2xl border border-zinc-800 bg-black p-5 text-left sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500">
                  Cliente
                </dt>
                <dd className="mt-1 font-semibold">{confirmation.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500">
                  Servizio
                </dt>
                <dd className="mt-1 font-semibold">{confirmation.service}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500">
                  Operatore
                </dt>
                <dd className="mt-1 font-semibold">{confirmation.operator}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500">
                  Data
                </dt>
                <dd className="mt-1 font-semibold capitalize">
                  {formatItalianDate(confirmation.date)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500">
                  Ora
                </dt>
                <dd className="mt-1 font-semibold">{confirmation.time}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-gray-500">
                  Durata e prezzo
                </dt>
                <dd className="mt-1 font-semibold">
                  {confirmation.duration} minuti
                  {confirmation.price != null
                    ? ` · ${formatPrice(confirmation.price)}`
                    : ""}
                </dd>
              </div>
            </dl>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setConfirmation(null);
                  setMessage("");
                }}
                className="rounded-xl border border-yellow-500 px-6 py-4 font-bold text-yellow-500 transition hover:bg-yellow-500 hover:text-black"
              >
                Nuova prenotazione
              </button>
            </div>
          </section>
        ) : (
          <>
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

          <fieldset className="grid gap-3">
            <legend className="font-semibold text-yellow-500">
              Scegli il servizio
            </legend>

            {loadingConfiguration ? (
              <p className="text-sm text-gray-400">Caricamento servizi...</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {services.map((service) => {
                  const selected = service.id === serviceId;
                  const price = formatPrice(service.price);

                  return (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setServiceId(service.id);
                        setOperatorId("");
                        setDate("");
                        setTime("");
                      }}
                      className={`overflow-hidden rounded-2xl border text-left transition ${
                        selected
                          ? "border-yellow-300 bg-yellow-500/15 ring-2 ring-yellow-500"
                          : "border-zinc-700 bg-zinc-900 hover:border-yellow-500/70"
                      }`}
                    >
                      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-black">
                        <div
                          aria-hidden="true"
                          className="flex h-20 w-20 items-center justify-center rounded-full border border-yellow-500/60 bg-zinc-950 text-4xl text-yellow-500"
                        >
                          ✂
                        </div>
                      </div>

                      <div className="p-4">
                        <h2 className="text-lg font-bold text-white">
                          {service.name}
                        </h2>
                        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-300">
                            {service.duration_minutes} minuti
                          </span>
                          {price && (
                            <span className="font-bold text-yellow-500">
                              {price}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <input name="service_id" type="hidden" value={serviceId} />

          <fieldset className="grid gap-3">
            <legend className="font-semibold text-yellow-500">
              Scegli l&apos;operatore
            </legend>

            {!serviceId ? (
              <p className="text-sm text-gray-400">
                Seleziona prima un servizio.
              </p>
            ) : loadingOperators ? (
              <p className="text-sm text-gray-400">
                Caricamento operatori...
              </p>
            ) : availableOperators.length === 0 ? (
              <p className="text-sm text-gray-400">
                Nessun operatore disponibile per questo servizio.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {availableOperators.map((operator) => {
                  const selected = operator.id === operatorId;

                  return (
                    <button
                      key={operator.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setOperatorId(operator.id);
                        setDate("");
                        setTime("");
                      }}
                      className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-yellow-300 bg-yellow-500/15 ring-2 ring-yellow-500"
                          : "border-zinc-700 bg-zinc-900 hover:border-yellow-500/70"
                      }`}
                    >
                      {operator.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={operator.image_url}
                          alt=""
                          className="h-20 w-20 shrink-0 rounded-full border border-yellow-500/50 object-cover"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-yellow-500/60 bg-black text-xl font-black text-yellow-500"
                        >
                          {getInitials(operator.name)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-white">
                          {operator.name}
                        </h2>
                        {operator.specialties && (
                          <p className="mt-1 text-sm font-medium text-yellow-500">
                            {operator.specialties}
                          </p>
                        )}
                        {operator.bio && (
                          <p className="mt-2 text-sm text-gray-400">
                            {operator.bio}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <input name="operator_id" type="hidden" value={operatorId} />

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
            disabled={
              submitting ||
              loadingSlots ||
              loadingOperators ||
              !operatorId ||
              !time
            }
            className="rounded-xl bg-yellow-500 p-4 font-bold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Invio..." : "Invia Prenotazione"}
          </button>

          {message && (
            <p className="text-center font-medium text-yellow-500">{message}</p>
          )}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
