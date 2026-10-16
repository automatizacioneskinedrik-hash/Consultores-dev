import { useEffect, useState } from "react";
import { getUser } from "../utils/user";
import UserAvatar from "./UserAvatar";
import "./ChangeHistory.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// The changes of one section of the app: when, what and who, with the person's photo.
// refreshKey reloads the list after the page saves something.
export default function ChangeHistory({ section, description, refreshKey = "" }) {
  const [changes, setChanges] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const user = getUser() || {};
    fetch(`${API_BASE_URL}/api/admin/audit-log?section=${section}`, { headers: { "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "" } })
      .then((response) => response.json())
      .then((data) => { if (!cancelled && data.ok) setChanges(data.changes); })
      .catch((error) => console.debug("Historial no disponible:", error.message))
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [section, refreshKey]);

  return <section className="changeHistory" aria-label="Historial de cambios">
    <h2>Historial de cambios</h2>
    {description && <p>{description}</p>}
    {loaded && changes.length === 0
      ? <div className="changeEmpty">Todavía no hay cambios registrados.</div>
      : <ul className="changeList">
          {changes.map((change) => <li key={change.id}>
            <span className="changeWhen">{change.changedAt ? new Date(change.changedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : ""}</span>
            <span className="changeWhat">{change.summary}</span>
            <span className="changeWho">
              <UserAvatar name={change.changedByName} email={change.changedBy} picture={change.changedByPicture} className="avatarSm" />
              <span>{change.changedByName || change.changedBy || "Sistema"}</span>
            </span>
          </li>)}
        </ul>}
  </section>;
}
