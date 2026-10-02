import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="text-center space-y-4">
        <h1 className="text-7xl font-light text-slate-300">404</h1>
        <p className="text-slate-600">That page does not exist.</p>
        <Link href="/" className="inline-flex h-10 items-center px-6 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700">
          Go home
        </Link>
      </div>
    </main>
  );
}
