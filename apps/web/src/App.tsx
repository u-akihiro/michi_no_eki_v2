import { Button } from './components/ui/button'

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <section className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-semibold">Hello from web</h1>
        <Button>shadcn/ui Button</Button>
      </section>
    </main>
  )
}
