function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-semibold text-slate-950">
            OS-LogPulse
          </h1>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-medium text-slate-900">
              Project selector
            </h2>
            <div className="mt-4 h-11 rounded-md border border-dashed border-slate-300 bg-slate-50" />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-medium text-slate-900">
              Pod selector
            </h2>
            <div className="mt-4 h-11 rounded-md border border-dashed border-slate-300 bg-slate-50" />
          </div>
        </section>

        <section className="min-h-96 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-medium text-slate-900">
            Log viewer area
          </h2>
          <div className="mt-4 h-72 rounded-md border border-dashed border-slate-300 bg-slate-950" />
        </section>
      </div>
    </main>
  )
}

export default App
