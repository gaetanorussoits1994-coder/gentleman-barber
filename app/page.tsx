"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const phone = formData.get("phone");
    const service = formData.get("service");
    const date = formData.get("date");
    const time = formData.get("time");
    const notes = formData.get("notes");

    const { error } = await supabase.from("appointments").insert([
      {
        name,
        phone,
        service,
        date,
        time,
        notes,
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

          <input name="date" required className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500" type="date" />
          <input name="time" required className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500" type="time" />

          <textarea name="notes" className="rounded-xl border border-zinc-700 bg-white p-4 text-black placeholder:text-zinc-500" placeholder="Note"></textarea>

          <button disabled={loading} className="rounded-xl bg-yellow-500 p-4 font-bold text-black">
            {loading ? "Invio..." : "Invia Prenotazione"}
          </button>

          {message && <p className="text-center text-yellow-500">{message}</p>}
        </form>
      </section>

      <section className="px-6 py-20 text-center">
        <h2 className="mb-8 text-4xl font-bold">Prenota dal telefono</h2>

        <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-yellow-500/50 bg-zinc-950 px-6 py-10 shadow-[0_0_45px_rgba(234,179,8,0.12)]">
          <div className="mb-7">
            <p className="text-2xl font-extrabold tracking-[0.18em] text-yellow-500 sm:text-3xl">
              THE GENTLEMAN
            </p>
            <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-yellow-100/70 sm:text-xs">
              Premium Barber Experience
            </p>
          </div>

          <div className="relative rounded-2xl border-2 border-yellow-500 bg-white p-3 shadow-[0_0_28px_rgba(234,179,8,0.2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=https%3A%2F%2Fgentleman-barber-kappa.vercel.app%2F"
              alt="QR code per prenotare sul sito The Gentleman"
              width={240}
              height={240}
              className="block h-auto w-full max-w-60"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border-2 border-yellow-500 bg-black text-xs font-black tracking-wider text-yellow-500 shadow-[0_0_0_3px_white]"
            >
              TG
            </div>
          </div>

          <p className="mt-6 text-lg text-gray-300">
            Scansiona il QR code per prenotare dal tuo smartphone
          </p>
        </div>
      </section>
    </main>
  );
}
