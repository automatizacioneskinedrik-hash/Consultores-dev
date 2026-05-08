import { useMemo } from "react";
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
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 20h18" />
                <path d="M6 20v-8" />
                <path d="M10 20v-12" />
                <path d="M14 20v-6" />
                <path d="M18 13v-3" />
                <path d="M15 11l3-3 3 3" />
              </svg>
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
