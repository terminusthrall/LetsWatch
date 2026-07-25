import CreateSessionForm from '@/modules/sessions/CreateSessionForm';

export default function Home() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            LetsWatch
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Create a watch session and find something everyone loves.
          </p>
        </div>

        <CreateSessionForm />
      </div>
    </main>
  );
}
