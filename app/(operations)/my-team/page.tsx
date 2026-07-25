import { requireOperationsAccess } from "@/lib/dashboardAuth/requireOperationsAccess";
import { normalizeEmail } from "@/lib/managerMapping/normalizeEmail";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CaAssignmentRow {
  ca_name: string;
  ca_email: string;
  system_name: string | null;
  designation: string | null;
  team_name: string;
}

interface MyTeamSupabase {
  from(table: "manager_ca_assignments"): {
    select(columns: string): {
      eq(column: string, value: string | boolean): {
        eq(column: string, value: string): Promise<{ data: CaAssignmentRow[] | null; error: { message: string } | null }>;
      } & Promise<{ data: CaAssignmentRow[] | null; error: { message: string } | null }>;
    } & Promise<{ data: CaAssignmentRow[] | null; error: { message: string } | null }>;
  };
}

export default async function MyTeamPage() {
  const session = await requireOperationsAccess();
  const supabase = createSupabaseServiceRoleClient() as unknown as MyTeamSupabase;

  const query = supabase
    .from("manager_ca_assignments")
    .select("ca_name, ca_email, system_name, designation, team_name")
    .eq("is_active", true);
  const { data, error } =
    session.user.role === "admin_ceo" ? await query : await query.eq("manager_email", normalizeEmail(session.user.email));

  const rows = error || !data ? [] : data;

  return (
    <main className="coo-page">
      <header className="coo-page__header">
        <div>
          <span className="coo-page__eyebrow">My Team</span>
          <h1 className="coo-page__title">Career Advisors</h1>
        </div>
      </header>
      <section>
        <div className="coo-table-card">
          <table className="coo-table">
            <thead>
              <tr>
                <th>CA Name</th>
                <th>CA Email</th>
                <th>System Name</th>
                <th>Designation</th>
                {session.user.role === "admin_ceo" ? <th>Team</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ca_email}>
                  <td>{row.ca_name}</td>
                  <td>{row.ca_email}</td>
                  <td>{row.system_name ?? "—"}</td>
                  <td>{row.designation ?? "—"}</td>
                  {session.user.role === "admin_ceo" ? <td>{row.team_name}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
