"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const CLOSED_DAY_MESSAGE = "Il locale è chiuso il lunedì.";
const INVALID_TIME_MESSAGE =
  "Orario non disponibile. Scegli un orario tra 08:00-12:30 oppure 13:30-18:00.";

function isMonday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() === 1;
}

function isAvailableTime(time: string) {
  return (
    (time >= "08:00" && time <= "12:30") ||
    (time >= "13:30" && time <= "18:00")
  );
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const phone = formData.get("phone");
    const service = formData.get("service");
    const date = String(formData.get("date"));
    const time = String(formData.get("time"));
    const notes = formData.get("notes");

    if (isMonday(date)) {
      setMessage(CLOSED_DAY_MESSAGE);
      return;
    }

    if (!isAvailableTime(time)) {
      setMessage(INVALID_TIME_MESSAGE);
      return;
    }

    setLoading(true);

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

    if (error) {
      console.error("SUPABASE ERROR FULL:", JSON.stringify(error, null, 2));
      console.error("SUPABASE ERROR RAW:", error);

      const errorMessage =
        error?.message ||
        error?.details ||
        error?.hint ||
        "Errore Supabase sconosciuto";

      setMessage(errorMessage);
    } else {
      setMessage("Prenotazione inviata con successo!");
      (event.target as HTMLFormElement).reset();
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 text-sm uppercase tracking-[0.4em] text-yellow-500">
          Premium Barber Experience
        </p>

        <h1 className="mb-6 text-6xl font-extrabold md:text-8xl">
          THE GENTLEMAN
        </h1>

        <p className="mb-10 max-w-2xl text-xl text-gray-300">
          Tagli moderni, barba perfetta e stile professionale. Prenota il tuo
          appuntamento in pochi secondi.
        </p>

        <a
          href="#prenota"
          className="rounded-xl bg-yellow-500 px-8 py-4 font-bold text-black"
        >
          Prenota Ora
        </a>
      </section>

      <section className="px-6 py-20">
        <h2 className="mb-12 text-center text-4xl font-bold">Servizi</h2>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {[
            ["Taglio Uomo", "Taglio moderno e personalizzato.", "25€"],
            ["Barba", "Rasatura, rifinitura e modellatura.", "15€"],
            ["Taglio + Barba", "Pacchetto completo per il tuo look.", "35€"],
          ].map(([title, desc, price]) => (
            <div key={title} className="rounded-2xl bg-zinc-900 p-8">
              <h3 className="mb-3 text-2xl font-bold">{title}</h3>
              <p className="mb-6 text-gray-400">{desc}</p>
              <p className="text-3xl font-bold text-yellow-500">{price}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="prenota" className="bg-zinc-950 px-6 py-20">
        <h2 className="mb-4 text-center text-4xl font-bold">Prenota</h2>

        <form onSubmit={handleSubmit} className="mx-auto grid max-w-2xl gap-4">
          <input name="name" required className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500" placeholder="Nome" />
          <input name="phone" required className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500" placeholder="Telefono" />

          <select name="service" className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500">
            <option>Taglio Uomo</option>
            <option>Barba</option>
            <option>Taglio + Barba</option>
          </select>

          <input
            name="date"
            required
            className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500"
            type="date"
            onChange={(event) =>
              setMessage(
                event.target.value && isMonday(event.target.value)
                  ? CLOSED_DAY_MESSAGE
                  : "",
              )
            }
          />
          <input
            name="time"
            required
            className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500"
            type="time"
            min="08:00"
            max="18:00"
            onChange={(event) =>
              setMessage(
                event.target.value && !isAvailableTime(event.target.value)
                  ? INVALID_TIME_MESSAGE
                  : "",
              )
            }
          />

          <textarea name="notes" className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500" placeholder="Note"></textarea>

          <button disabled={loading} className="rounded-xl bg-yellow-500 p-4 font-bold text-black">
            {loading ? "Invio..." : "Invia Prenotazione"}
          </button>

          {message && <p className="text-center text-yellow-500">{message}</p>}
        </form>
      </section>

      <footer className="border-t border-yellow-500/40 bg-black px-6 py-14 text-center">
        <div className="mx-auto max-w-xl">
          <p className="text-2xl font-extrabold tracking-[0.2em] text-yellow-500">
            The Gentleman
          </p>
          <address className="mt-4 not-italic text-gray-300">
            Via Gattamelata, 35129 Padova (PD)
          </address>

          <div className="mx-auto my-7 h-px w-24 bg-yellow-500/60" />

          <p className="font-semibold uppercase tracking-[0.2em] text-yellow-500">
            Orari di apertura
          </p>
          <div className="mt-4 space-y-1 text-gray-300">
            <p>Martedì - Domenica</p>
            <p>08:00 - 12:30</p>
            <p>13:30 - 18:00</p>
            <p className="pt-3 font-semibold text-yellow-500">Lunedì chiuso</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
