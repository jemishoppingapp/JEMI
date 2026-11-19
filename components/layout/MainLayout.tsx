import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <main className="flex-1">{children}</main>
      {/* Bottom padding on phones so the fixed bottom nav (56px + the
          iPhone home-bar area) never covers the end of the page. */}
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Footer />
      </div>
      <MobileBottomNav />
    </div>
  );
}