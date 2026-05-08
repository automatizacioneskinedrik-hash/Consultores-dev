import { useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { getUser } from "../utils/user";
import "./Dashboard.css";

export default function Dashboard() {
  const user = useMemo(() => getUser() || {}, []);
  const email = String(user.email || "").toLowerCase();
  const isAuthorizedSuperAdmin = user?.role === "superadmin" || email === "adminkinedrik@eadic.com";

  return (
    <div className="dashboardPage">
      <Sidebar />
      <main className="dashboardContent">
        <header className="dashboardHeader">
          <div className="dashboardHeaderTitle">
            <div className="dashboardHeaderIcon" aria-hidden="true">
              <LayoutDashboard size={26} strokeWidth={2} />
            </div>
            <div className="dashboardHeaderText">
              <h1>Dashboard</h1>
              <p>Analítica y visión general del sistema (solo superadmin).</p>
            </div>
          </div>
        </header>

        {!isAuthorizedSuperAdmin ? (
          <section className="dashboardDenied" role="alert">
            No tienes permiso para acceder a esta sección.
          </section>
        ) : (
          <section className="dashboardEmpty">
            <div className="dashboardCard">
              <h2>Próximamente</h2>
              <p>
                Aquí podrás ver métricas globales, tendencias y reportes de uso para apoyar
                decisiones basadas en datos.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
