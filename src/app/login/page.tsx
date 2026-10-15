import { Suspense } from "react"
import { LoginForm } from "@/components/LoginForm"

export const metadata = {
  title: "Anmelden | Vokabeltrainer",
  description: "Anmeldung zum Vokabeltrainer",
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-500">
            Laden...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  )
}
