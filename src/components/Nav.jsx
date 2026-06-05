export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-stone-200 bg-white">
      <div className="flex h-20 w-full items-center justify-between px-8">
        <img
          src="/deciops-logo.png"
          alt="DeciOps.ai"
          className="h-12 w-auto"
        />
        <span className="font-label text-[12px] font-semibold uppercase tracking-[0.15em] text-stone-400">
          Confidential · Platform Demo
        </span>
      </div>
    </nav>
  );
}
