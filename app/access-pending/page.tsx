import { requireDashboardSession } from "@/lib/dashboardAuth/requireDashboardSession";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccessPendingPage() {
  await requireDashboardSession();

  return (
    <main className="access-pending-shell" data-testid="access-pending-shell">
      <div className="access-pending-card">
        <h1>Your ApplyWizz account is active.</h1>
        <p>Your client access is being prepared.</p>
        <p>Contact your manager if you need immediate assistance.</p>
      </div>
      <style>{`
        .access-pending-shell {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: #0B1D33;
          color: #F5F5F5;
        }
        .access-pending-card {
          max-width: 420px;
          text-align: center;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          padding: 32px;
        }
        .access-pending-card h1 {
          font-size: 1.4rem;
          margin-bottom: 12px;
        }
        .access-pending-card p {
          color: #cbd5e1;
          margin: 6px 0;
        }
      `}</style>
    </main>
  );
}
