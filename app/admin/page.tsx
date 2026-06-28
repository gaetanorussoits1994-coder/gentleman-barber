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

type ArchivedAppointment = Appointment & {
  archived_at: string;
};

type AppointmentFilter = "today" | "future" | "past" | "all";

type Operator = {
  id: string;
  name: string;
  bio: string | null;
  image_url: string | null;
  specialties: string | null;
  active: boolean;
  created_at?: string;
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  duration_minutes: number;
  featured: boolean;
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

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function fetchAllAppointments() {
  const pageSize = 1000;
  const rows: Appointment[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as Appointment[]));

    if ((data ?? []).length < pageSize) {
      return { data: rows, error: null };
    }
  }
}

async function fetchAllArchivedAppointments() {
  const pageSize = 1000;
  const rows: ArchivedAppointment[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("appointments_archive")
      .select("*")
      .order("archived_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as ArchivedAppointment[]));

    if ((data ?? []).length < pageSize) {
      return { data: rows, error: null };
    }
  }
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
  const [appointmentFilter, setAppointmentFilter] =
    useState<AppointmentFilter>("today");
  const [archiving, setArchiving] = useState(false);
  const [exportingArchive, setExportingArchive] = useState(false);
  const [associationOperatorId, setAssociationOperatorId] = useState("");
  const [associationServiceId, setAssociationServiceId] = useState("");
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(
    null,
  );
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

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
        fetchAllAppointments(),
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

  async function handleDeleteOperator(operator: Operator) {
    const confirmed = window.confirm(
      `Vuoi eliminare l'operatore ${operator.name}?`,
    );

    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("operators")
      .delete()
      .eq("id", operator.id);

    if (deleteError) {
      showError(deleteError.message);
      return;
    }

    setOperators((current) =>
      current.filter((item) => item.id !== operator.id),
    );
    setAssociations((current) =>
      current.filter((item) => item.operator_id !== operator.id),
    );
    setEditingOperatorId((current) =>
      current === operator.id ? null : current,
    );
    showNotice("Operatore eliminato.");
  }

  async function handleUpdateOperator(
    event: React.FormEvent<HTMLFormElement>,
    operator: Operator,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updates = {
      name: String(formData.get("name") ?? "").trim(),
      bio: String(formData.get("bio") ?? "").trim() || null,
      image_url: String(formData.get("image_url") ?? "").trim() || null,
      specialties:
        String(formData.get("specialties") ?? "").trim() || null,
      active: formData.get("active") === "true",
    };

    if (!updates.name) {
      showError("Il nome dell'operatore è obbligatorio.");
      return;
    }

    const { data, error: updateError } = await supabase
      .from("operators")
      .update(updates)
      .eq("id", operator.id)
      .select("*")
      .single();

    if (updateError) {
      showError(updateError.message);
      return;
    }

    setOperators((current) =>
      current
        .map((item) => (item.id === operator.id ? (data as Operator) : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditingOperatorId(null);
    showNotice("Operatore aggiornato.");
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

  async function handleUpdateService(
    event: React.FormEvent<HTMLFormElement>,
    service: Service,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const duration = Number(formData.get("duration_minutes"));
    const priceValue = String(formData.get("price") ?? "").trim();
    const price = priceValue ? Number(priceValue) : null;
    const updates = {
      name,
      description:
        String(formData.get("description") ?? "").trim() || null,
      image_url: String(formData.get("image_url") ?? "").trim() || null,
      price,
      duration_minutes: duration,
      featured: formData.get("featured") === "true",
      active: formData.get("active") === "true",
    };

    if (!name || !Number.isInteger(duration) || duration <= 0) {
      showError("Inserisci nome e durata valida per il servizio.");
      return;
    }

    if (price != null && (!Number.isFinite(price) || price < 0)) {
      showError("Inserisci un prezzo valido.");
      return;
    }

    const { data, error: updateError } = await supabase
      .from("services")
      .update(updates)
      .eq("id", service.id)
      .select("*")
      .single();

    if (updateError) {
      showError(updateError.message);
      return;
    }

    setServices((current) =>
      current
        .map((item) => (item.id === service.id ? (data as Service) : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditingServiceId(null);
    showNotice("Servizio aggiornato.");
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
      "Vuoi eliminare definitivamente questa prenotazione?",
    );

    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    if (deleteError) {
      showError(
        `Impossibile eliminare la prenotazione: ${deleteError.message}`,
      );
      return;
    }

    setAppointments((currentAppointments) =>
      currentAppointments.filter((item) => item.id !== appointment.id),
    );
    showNotice("Prenotazione eliminata.");
  }

  async function handleArchiveOldAppointments() {
    const confirmed = window.confirm(
      "Vuoi archiviare le prenotazioni più vecchie di 20 giorni?",
    );

    if (!confirmed) {
      return;
    }

    setArchiving(true);
    const { data, error: archiveError } = await supabase.rpc(
      "archive_old_appointments",
    );

    if (archiveError) {
      setArchiving(false);
      showError(
        `Impossibile archiviare le prenotazioni: ${archiveError.message}`,
      );
      return;
    }

    const refreshedAppointments = await fetchAllAppointments();
    setArchiving(false);

    if (refreshedAppointments.error) {
      showError(
        `Archiviazione completata, ma non è stato possibile aggiornare la tabella: ${refreshedAppointments.error.message}`,
      );
      return;
    }

    setAppointments(refreshedAppointments.data ?? []);
    const archivedCount = Number(data ?? 0);
    showNotice(
      `${archivedCount} prenotazion${archivedCount === 1 ? "e archiviata" : "i archiviate"}.`,
    );
  }

  function createCsvRows(items: Appointment[], includeArchivedAt = false) {
    const header = [
      "Nome",
      "Telefono",
      "Servizio",
      "Operatore",
      "Durata",
      "Prezzo",
      "Data",
      "Ora",
      "Stato",
      "Note",
      "Creato il",
    ];

    if (includeArchivedAt) {
      header.push("Archiviato il");
    }

    return [
      header,
      ...items.map((appointment) => {
        const service = services.find(
          (item) => item.id === appointment.service_id,
        );
        const operator = operators.find(
          (item) => item.id === appointment.operator_id,
        );
        const row: unknown[] = [
          appointment.name,
          appointment.phone,
          service?.name ?? appointment.service,
          operator?.name ?? "Non assegnato",
          service ? service.duration_minutes : "",
          service?.price ?? "",
          appointment.date,
          appointment.time,
          getAppointmentStatus(appointment.status),
          appointment.notes ?? "",
          appointment.created_at ?? "",
        ];

        if (includeArchivedAt) {
          row.push((appointment as ArchivedAppointment).archived_at);
        }

        return row;
      }),
    ];
  }

  function handleDownloadCsv() {
    downloadCsv(
      `prenotazioni-the-gentleman-${getToday()}.csv`,
      createCsvRows(filteredAppointments),
    );
  }

  async function handleDownloadArchiveCsv() {
    setExportingArchive(true);
    const archiveResult = await fetchAllArchivedAppointments();
    setExportingArchive(false);

    if (archiveResult.error) {
      showError(
        `Impossibile scaricare l'archivio: ${archiveResult.error.message}`,
      );
      return;
    }

    downloadCsv(
      "archivio-prenotazioni-the-gentleman.csv",
      createCsvRows(archiveResult.data ?? [], true),
    );
  }

  const today = getToday();
  const filteredAppointments = appointments
    .filter((appointment) => {
      if (appointmentFilter === "today") {
        return appointment.date === selectedDate;
      }

      if (appointmentFilter === "future") {
        return appointment.date >= today;
      }

      if (appointmentFilter === "past") {
        return appointment.date < today;
      }

      return true;
    })
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.time.localeCompare(second.time),
    );

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
            {operators.map((operator) =>
              editingOperatorId === operator.id ? (
                <form
                  key={operator.id}
                  onSubmit={(event) => handleUpdateOperator(event, operator)}
                  className="grid gap-3 rounded-xl border border-yellow-500/50 bg-zinc-900 p-4"
                >
                  <input
                    name="name"
                    required
                    defaultValue={operator.name}
                    placeholder="Nome"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <textarea
                    name="bio"
                    rows={3}
                    defaultValue={operator.bio ?? ""}
                    placeholder="Bio breve"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <input
                    name="image_url"
                    type="url"
                    defaultValue={operator.image_url ?? ""}
                    placeholder="URL foto facoltativo"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <input
                    name="specialties"
                    defaultValue={operator.specialties ?? ""}
                    placeholder="Specialità"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <select
                    name="active"
                    defaultValue={String(operator.active)}
                    className="rounded-lg bg-white p-3 text-black"
                  >
                    <option value="true">Attivo</option>
                    <option value="false">Non attivo</option>
                  </select>
                  <div className="flex gap-2">
                    <button className="flex-1 rounded-lg bg-yellow-500 p-3 font-bold text-black">
                      Salva
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingOperatorId(null)}
                      className="rounded-lg border border-zinc-600 px-4 text-gray-300"
                    >
                      Annulla
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={operator.id}
                  className="rounded-lg bg-zinc-900 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{operator.name}</p>
                      {operator.specialties && (
                        <p className="text-sm text-yellow-500">
                          {operator.specialties}
                        </p>
                      )}
                      {operator.bio && (
                        <p className="mt-1 text-xs text-gray-400">
                          {operator.bio}
                        </p>
                      )}
                      {operator.image_url && (
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {operator.image_url}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {operator.active ? "Attivo" : "Disattivato"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingOperatorId(operator.id)}
                        className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-bold text-black"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleOperator(operator)}
                        className="rounded-lg border border-yellow-500 px-3 py-2 text-sm text-yellow-500"
                      >
                        {operator.active ? "Disattiva" : "Attiva"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOperator(operator)}
                        className="rounded-lg border border-red-500 px-3 py-2 text-sm text-red-400"
                      >
                        Elimina
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
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
            {services.map((service) =>
              editingServiceId === service.id ? (
                <form
                  key={service.id}
                  onSubmit={(event) => handleUpdateService(event, service)}
                  className="grid gap-3 rounded-xl border border-yellow-500/50 bg-zinc-900 p-4"
                >
                  <input
                    name="name"
                    required
                    defaultValue={service.name}
                    placeholder="Nome"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={service.description ?? ""}
                    placeholder="Descrizione breve"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <input
                    name="image_url"
                    type="url"
                    defaultValue={service.image_url ?? ""}
                    placeholder="URL immagine facoltativo"
                    className="rounded-lg bg-white p-3 text-black"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={service.price ?? ""}
                      placeholder="Prezzo €"
                      className="rounded-lg bg-white p-3 text-black"
                    />
                    <input
                      name="duration_minutes"
                      type="number"
                      min="1"
                      required
                      defaultValue={service.duration_minutes}
                      placeholder="Durata minuti"
                      className="rounded-lg bg-white p-3 text-black"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      name="featured"
                      defaultValue={String(service.featured)}
                      className="rounded-lg bg-white p-3 text-black"
                    >
                      <option value="true">Featured: sì</option>
                      <option value="false">Featured: no</option>
                    </select>
                    <select
                      name="active"
                      defaultValue={String(service.active)}
                      className="rounded-lg bg-white p-3 text-black"
                    >
                      <option value="true">Attivo</option>
                      <option value="false">Non attivo</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 rounded-lg bg-yellow-500 p-3 font-bold text-black">
                      Salva
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingServiceId(null)}
                      className="rounded-lg border border-zinc-600 px-4 text-gray-300"
                    >
                      Annulla
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={service.id}
                  className="rounded-lg bg-zinc-900 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {service.name}
                        {service.featured && (
                          <span className="ml-2 text-xs text-yellow-500">
                            Featured
                          </span>
                        )}
                      </p>
                      {service.description && (
                        <p className="mt-1 text-xs text-gray-400">
                          {service.description}
                        </p>
                      )}
                      {service.image_url && (
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {service.image_url}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {service.duration_minutes} min ·{" "}
                        {formatPrice(service.price)} ·{" "}
                        {service.active ? "Attivo" : "Disattivato"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingServiceId(service.id)}
                        className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-bold text-black"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleService(service)}
                        className="rounded-lg border border-yellow-500 px-3 py-2 text-sm text-yellow-500"
                      >
                        {service.active ? "Disattiva" : "Attiva"}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
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

        <div className="mb-8 grid gap-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:grid-cols-[minmax(280px,420px)_1fr] md:items-end">
          <div className="grid gap-4">
            <div>
              <p className="mb-2 font-semibold text-yellow-500">Vista</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["today", "Oggi"],
                    ["future", "Future"],
                    ["past", "Passate"],
                    ["all", "Tutte"],
                  ] as [AppointmentFilter, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={appointmentFilter === value}
                    onClick={() => setAppointmentFilter(value)}
                    className={`rounded-lg border px-4 py-2 font-bold transition ${
                      appointmentFilter === value
                        ? "border-yellow-500 bg-yellow-500 text-black"
                        : "border-zinc-700 text-gray-300 hover:border-yellow-500 hover:text-yellow-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2">
              <span className="font-semibold text-yellow-500">
                Data per la vista Oggi
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setAppointmentFilter("today");
                }}
                className="rounded-lg border border-zinc-700 bg-white p-3 text-black"
              />
            </label>
          </div>

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

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="rounded-lg bg-yellow-500 px-4 py-3 font-bold text-black transition hover:bg-yellow-400"
            >
              Scarica CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadArchiveCsv}
              disabled={exportingArchive}
              className="rounded-lg border border-yellow-500 px-4 py-3 font-bold text-yellow-500 transition hover:bg-yellow-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingArchive
                ? "Preparazione archivio..."
                : "Scarica Archivio CSV"}
            </button>
            <button
              type="button"
              onClick={handleArchiveOldAppointments}
              disabled={archiving}
              className="rounded-lg border border-red-500 px-4 py-3 font-bold text-red-400 transition hover:bg-red-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {archiving
                ? "Archiviazione..."
                : "Archivia prenotazioni vecchie"}
            </button>
          </div>
        </div>

        <p className="mb-4 text-gray-300">
          {filteredAppointments.length} appuntament
          {filteredAppointments.length === 1 ? "o" : "i"} visualizzat
          {filteredAppointments.length === 1 ? "o" : "i"}
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
              {filteredAppointments.map((appointment) => {
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
              {filteredAppointments.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-400">
                    Nessuna prenotazione per questo filtro.
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
