"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Appointment = {
  id: string | number;
  created_at?: string;
  name: string;
  phone: string;
  service: string;
  service_id: string | null;
  operator_id: string | null;
  date: string;
  time: string;
  notes: string | null;
  status: "pending" | "confirmed" | "rejected" | string | null;
};

type Operator = {
  id: string;
  name: string;
  active: boolean;
  created_at?: string;
};

type Service = {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number;
  active: boolean;
  created_at?: string;
};

type OperatorService = {
  operator_id: string;
  service_id: string;
};

function formatPhoneForWhatsApp(phone: string) {
  let formattedPhone = phone.replace(/\s/g, "").replace(/\+/g, "");

  if (!formattedPhone.startsWith("39")) {
    formattedPhone = `39${formattedPhone}`;
  }

  return formattedPhone;
}

function buildWhatsAppUrl(
  appointment: Appointment,
  operatorName: string,
  status: "confirmed" | "rejected",
) {
  const message =
    status === "confirmed"
      ? `Ciao ${appointment.name}, la tua prenotazione presso The Gentleman è confermata.

Servizio: ${appointment.service}
Operatore: ${operatorName}
Data: ${appointment.date}
Ora: ${appointment.time}

Ti aspettiamo.`
      : `Ciao ${appointment.name}, purtroppo l'orario richiesto non è disponibile.

Servizio: ${appointment.service}
Operatore: ${operatorName}
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

function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPrice(price: number | null) {
  if (price == null) {
    return "—";
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(price);
}

export default function AdminPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [associations, setAssociations] = useState<OperatorService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [associationOperatorId, setAssociationOperatorId] = useState("");
  const [associationServiceId, setAssociationServiceId] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const [
        appointmentsResult,
        operatorsResult,
        servicesResult,
        associationsResult,
      ] = await Promise.all([
        supabase
          .from("appointments")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("operators").select("*").order("name"),
        supabase.from("services").select("*").order("name"),
        supabase
          .from("operator_services")
          .select("operator_id, service_id"),
      ]);

      if (!active) {
        return;
      }

      setAppointments((appointmentsResult.data ?? []) as Appointment[]);
      setOperators((operatorsResult.data ?? []) as Operator[]);
      setServices((servicesResult.data ?? []) as Service[]);
      setAssociations(
        (associationsResult.data ?? []) as OperatorService[],
      );

      const loadError =
        appointmentsResult.error ||
        operatorsResult.error ||
        servicesResult.error ||
        associationsResult.error;
      setError(loadError?.message ?? null);
      setLoading(false);
    }

    void loadDashboard();

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

  function showError(message: string) {
    setNotice(null);
    setError(message);
  }

  function showNotice(message: string) {
    setError(null);
    setNotice(message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleAddOperator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("operator_name") ?? "").trim();

    if (!name) {
      return;
    }

    const { data, error: insertError } = await supabase
      .from("operators")
      .insert({ name, active: true })
      .select("*")
      .single();

    if (insertError) {
      showError(insertError.message);
      return;
    }

    setOperators((current) =>
      [...current, data as Operator].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    form.reset();
    showNotice("Operatore aggiunto.");
  }

  async function handleToggleOperator(operator: Operator) {
    const { error: updateError } = await supabase
      .from("operators")
      .update({ active: !operator.active })
      .eq("id", operator.id);

    if (updateError) {
      showError(updateError.message);
      return;
    }

    setOperators((current) =>
      current.map((item) =>
        item.id === operator.id ? { ...item, active: !item.active } : item,
      ),
    );
    showNotice(
      `Operatore ${operator.active ? "disattivato" : "attivato"}.`,
    );
  }

  async function handleAddService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("service_name") ?? "").trim();
    const duration = Number(formData.get("duration_minutes"));
    const priceValue = String(formData.get("price") ?? "").trim();
    const price = priceValue ? Number(priceValue) : null;

    if (!name || !Number.isInteger(duration) || duration <= 0) {
      showError("Inserisci nome e durata valida per il servizio.");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("services")
      .insert({
        name,
        price,
        duration_minutes: duration,
        active: true,
      })
      .select("*")
      .single();

    if (insertError) {
      showError(insertError.message);
      return;
    }

    setServices((current) =>
      [...current, data as Service].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    form.reset();
    showNotice("Servizio aggiunto.");
  }

  async function handleToggleService(service: Service) {
    const { error: updateError } = await supabase
      .from("services")
      .update({ active: !service.active })
      .eq("id", service.id);

    if (updateError) {
      showError(updateError.message);
      return;
    }

    setServices((current) =>
      current.map((item) =>
        item.id === service.id ? { ...item, active: !item.active } : item,
      ),
    );
    showNotice(`Servizio ${service.active ? "disattivato" : "attivato"}.`);
  }

  async function handleAssociate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!associationOperatorId || !associationServiceId) {
      showError("Seleziona operatore e servizio.");
      return;
    }

    const alreadyExists = associations.some(
      (association) =>
        association.operator_id === associationOperatorId &&
        association.service_id === associationServiceId,
    );

    if (alreadyExists) {
      showError("Questa associazione esiste già.");
      return;
    }

    const association = {
      operator_id: associationOperatorId,
      service_id: associationServiceId,
    };
    const { error: insertError } = await supabase
      .from("operator_services")
      .insert(association);

    if (insertError) {
      showError(insertError.message);
      return;
    }

    setAssociations((current) => [...current, association]);
    showNotice("Servizio associato all'operatore.");
  }

  async function handleDisassociate(association: OperatorService) {
    const { error: deleteError } = await supabase
      .from("operator_services")
      .delete()
      .eq("operator_id", association.operator_id)
      .eq("service_id", association.service_id);

    if (deleteError) {
      showError(deleteError.message);
      return;
    }

    setAssociations((current) =>
      current.filter(
        (item) =>
          item.operator_id !== association.operator_id ||
          item.service_id !== association.service_id,
      ),
    );
    showNotice("Associazione rimossa.");
  }

  async function handleAppointmentStatus(
    appointment: Appointment,
    status: "confirmed" | "rejected",
  ) {
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointment.id);

    if (updateError) {
      showError(updateError.message);
      return;
    }

    setAppointments((currentAppointments) =>
      currentAppointments.map((item) =>
        item.id === appointment.id ? { ...item, status } : item,
      ),
    );

    const operatorName =
      operators.find((operator) => operator.id === appointment.operator_id)
        ?.name ?? "Da definire";
    window.open(
      buildWhatsAppUrl(appointment, operatorName, status),
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function handleDeleteAppointment(appointment: Appointment) {
    const confirmed = window.confirm(
      `Vuoi eliminare la prenotazione di ${appointment.name}?`,
    );

    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    if (deleteError) {
      showError(deleteError.message);
      return;
    }

    setAppointments((currentAppointments) =>
      currentAppointments.filter((item) => item.id !== appointment.id),
    );
  }

  const dailyAppointments = appointments
    .filter((appointment) => appointment.date === selectedDate)
    .sort((first, second) => first.time.localeCompare(second.time));

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-yellow-500">
        Caricamento...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white sm:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-yellow-500 sm:text-4xl">
          Gestione The Gentleman
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
        <p className="mb-6 rounded-xl border border-red-700 bg-red-950 p-4 text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-6 rounded-xl border border-green-700 bg-green-950 p-4 text-green-200">
          {notice}
        </p>
      )}

      <div className="mb-10 grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-5 text-2xl font-bold text-yellow-500">
            Gestione Operatori
          </h2>
          <form onSubmit={handleAddOperator} className="mb-5 flex gap-2">
            <input
              name="operator_name"
              required
              placeholder="Nome operatore"
              className="min-w-0 flex-1 rounded-lg bg-white p-3 text-black"
            />
            <button className="rounded-lg bg-yellow-500 px-4 font-bold text-black">
              Aggiungi
            </button>
          </form>
          <div className="space-y-2">
            {operators.map((operator) => (
              <div
                key={operator.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900 p-3"
              >
                <div>
                  <p className="font-semibold">{operator.name}</p>
                  <p className="text-xs text-gray-400">
                    {operator.active ? "Attivo" : "Disattivato"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleOperator(operator)}
                  className="rounded-lg border border-yellow-500 px-3 py-2 text-sm text-yellow-500"
                >
                  {operator.active ? "Disattiva" : "Attiva"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-5 text-2xl font-bold text-yellow-500">
            Gestione Servizi
          </h2>
          <form onSubmit={handleAddService} className="mb-5 grid gap-2">
            <input
              name="service_name"
              required
              placeholder="Nome servizio"
              className="rounded-lg bg-white p-3 text-black"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Prezzo €"
                className="rounded-lg bg-white p-3 text-black"
              />
              <input
                name="duration_minutes"
                type="number"
                min="15"
                step="15"
                required
                placeholder="Durata minuti"
                className="rounded-lg bg-white p-3 text-black"
              />
            </div>
            <button className="rounded-lg bg-yellow-500 p-3 font-bold text-black">
              Aggiungi Servizio
            </button>
          </form>
          <div className="space-y-2">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900 p-3"
              >
                <div>
                  <p className="font-semibold">{service.name}</p>
                  <p className="text-xs text-gray-400">
                    {service.duration_minutes} min · {formatPrice(service.price)} ·{" "}
                    {service.active ? "Attivo" : "Disattivato"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleService(service)}
                  className="rounded-lg border border-yellow-500 px-3 py-2 text-sm text-yellow-500"
                >
                  {service.active ? "Disattiva" : "Attiva"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-5 text-2xl font-bold text-yellow-500">
            Associazioni
          </h2>
          <form onSubmit={handleAssociate} className="mb-5 grid gap-2">
            <select
              value={associationOperatorId}
              onChange={(event) =>
                setAssociationOperatorId(event.target.value)
              }
              className="rounded-lg bg-white p-3 text-black"
            >
              <option value="">Seleziona operatore</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
            <select
              value={associationServiceId}
              onChange={(event) =>
                setAssociationServiceId(event.target.value)
              }
              className="rounded-lg bg-white p-3 text-black"
            >
              <option value="">Seleziona servizio</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-yellow-500 p-3 font-bold text-black">
              Associa
            </button>
          </form>
          <div className="space-y-2">
            {associations.map((association) => {
              const operator = operators.find(
                (item) => item.id === association.operator_id,
              );
              const service = services.find(
                (item) => item.id === association.service_id,
              );

              return (
                <div
                  key={`${association.operator_id}-${association.service_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900 p-3"
                >
                  <p className="text-sm">
                    {operator?.name ?? "Operatore"} →{" "}
                    {service?.name ?? "Servizio"}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDisassociate(association)}
                    className="rounded-lg border border-red-500 px-3 py-2 text-xs text-red-400"
                  >
                    Disassocia
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-5 text-3xl font-bold text-yellow-500">
          Appuntamenti
        </h2>

        <div className="mb-8 grid gap-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:grid-cols-[minmax(220px,320px)_1fr] md:items-end">
          <label className="grid gap-2">
            <span className="font-semibold text-yellow-500">
              Giornata da visualizzare
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-zinc-700 bg-white p-3 text-black"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Legenda
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full border border-yellow-500 px-3 py-1 text-yellow-500">
                pending = in attesa
              </span>
              <span className="rounded-full border border-green-500 px-3 py-1 text-green-400">
                confirmed = confermato
              </span>
              <span className="rounded-full border border-red-500 px-3 py-1 text-red-400">
                rejected = rifiutato
              </span>
            </div>
          </div>
        </div>

        <p className="mb-4 text-gray-300">
          {dailyAppointments.length} appuntament
          {dailyAppointments.length === 1 ? "o" : "i"} per il {selectedDate}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-zinc-900">
            <thead>
              <tr className="border-b border-zinc-700 text-left">
                <th className="p-4">Cliente</th>
                <th className="p-4">Servizio</th>
                <th className="p-4">Operatore</th>
                <th className="p-4">Durata</th>
                <th className="p-4">Prezzo</th>
                <th className="p-4">Ora</th>
                <th className="p-4">Note</th>
                <th className="p-4">Stato</th>
                <th className="p-4">Azioni</th>
              </tr>
            </thead>

            <tbody>
              {dailyAppointments.map((appointment) => {
                const service = services.find(
                  (item) => item.id === appointment.service_id,
                );
                const operator = operators.find(
                  (item) => item.id === appointment.operator_id,
                );

                return (
                  <tr key={appointment.id} className="border-b border-zinc-800">
                    <td className="p-4">
                      <p className="font-semibold">{appointment.name}</p>
                      <p className="text-sm text-gray-400">
                        {appointment.phone}
                      </p>
                    </td>
                    <td className="p-4">{service?.name ?? appointment.service}</td>
                    <td className="p-4">{operator?.name ?? "Non assegnato"}</td>
                    <td className="p-4">
                      {service ? `${service.duration_minutes} min` : "—"}
                    </td>
                    <td className="p-4">
                      {service ? formatPrice(service.price) : "—"}
                    </td>
                    <td className="p-4">{appointment.time}</td>
                    <td className="p-4">{appointment.notes || "—"}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full border px-3 py-1 text-sm font-bold ${getStatusBadgeClass(appointment.status)}`}
                      >
                        {getAppointmentStatus(appointment.status)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleAppointmentStatus(appointment, "confirmed")
                          }
                          className="rounded-lg bg-yellow-500 px-4 py-2 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            getAppointmentStatus(appointment.status) ===
                            "confirmed"
                          }
                        >
                          Conferma
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAppointmentStatus(appointment, "rejected")
                          }
                          className="rounded-lg border border-yellow-500 px-4 py-2 font-bold text-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            getAppointmentStatus(appointment.status) ===
                            "rejected"
                          }
                        >
                          Rifiuta
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteAppointment(appointment)
                          }
                          className="rounded-lg border border-red-500 px-4 py-2 font-bold text-red-400"
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {dailyAppointments.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-400">
                    Nessun appuntamento per questa data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
