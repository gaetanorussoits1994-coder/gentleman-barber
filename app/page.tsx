import Link from "next/link";

export default function Home() {
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

        <Link
          href="/prenota"
          className="rounded-xl bg-yellow-500 px-8 py-4 font-bold text-black transition hover:bg-yellow-400"
        >
          Prenota Ora
        </Link>
      </section>

      <section className="px-6 py-20">
        <h2 className="mb-12 text-center text-4xl font-bold">Servizi</h2>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {[
            ["Taglio Uomo", "Taglio moderno e personalizzato.", "25€"],
            ["Barba", "Rasatura, rifinitura e modellatura.", "15€"],
            ["Taglio + Barba", "Pacchetto completo per il tuo look.", "35€"],
          ].map(([title, description, price]) => (
            <div key={title} className="rounded-2xl bg-zinc-900 p-8">
              <h3 className="mb-3 text-2xl font-bold">{title}</h3>
              <p className="mb-6 text-gray-400">{description}</p>
              <p className="text-3xl font-bold text-yellow-500">{price}</p>
            </div>
          ))}
        </div>
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
