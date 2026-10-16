import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import UserAvatar from "./UserAvatar";
import "./OwnerPicker.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// "¿De quién es esta llamada?": roles that see everyone can upload a call for another person.
// The server checks the permission again; this only offers the choice.
export default function OwnerPicker({ user, value, onChange, disabled }) {
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/admin/users`, { headers: { "X-Admin-Email": user.email || "", "X-Auth-Token": user.authToken || "" } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setPeople(data.users.map((u) => ({ email: u.email, name: u.name || u.email, picture: u.picture || u.photoURL || "" })).sort((a, b) => a.name.localeCompare(b.name, "es")));
      })
      .catch(() => { /* without the list the call stays under the uploader's name */ });
    return () => { cancelled = true; };
  }, [user.email, user.authToken]);

  const isMine = !value || value === user.email;
  const selected = people.find((person) => person.email === value);
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term ? people.filter((p) => p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)) : people;
    return list;
  }, [people, query]);

  const choose = (email) => { onChange(email); setQuery(""); setOpen(false); };

  return <div className="ownerPicker">
    <span className="ownerLabel">¿De quién es esta llamada?</span>
    {!open
      ? <div className="ownerChosen">
          <UserAvatar name={isMine ? user.fullName : selected?.name} email={isMine ? user.email : value} picture={isMine ? user.picture : selected?.picture} className="avatarSm" />
          <strong>{isMine ? "Tuya" : selected?.name || value}</strong>
          {!isMine && <span className="ownerEmail">{value}</span>}
          <button type="button" className="ownerChange" onClick={() => setOpen(true)} disabled={disabled}>Cambiar</button>
          {!isMine && <button type="button" className="ownerReset" onClick={() => choose(user.email)} disabled={disabled} aria-label="Volver a mi nombre"><X size={14} /></button>}
        </div>
      : <div className="ownerSearch">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
            placeholder="Busca por nombre o correo"
            aria-label="Buscar a la persona dueña de la llamada"
          />
          <ul className="ownerList" role="listbox">
            {matches.map((person) => <li key={person.email}>
              <button type="button" role="option" aria-selected={person.email === value} onClick={() => choose(person.email)}>
                <UserAvatar name={person.name} email={person.email} picture={person.picture} />
                <span className="ownerPerson">
                  <strong>{person.name}{person.email === user.email ? " (tú)" : ""}</strong>
                  <span>{person.email}</span>
                </span>
              </button>
            </li>)}
            {!matches.length && <li className="ownerEmpty">Nadie coincide con la búsqueda.</li>}
          </ul>
          <button type="button" className="ownerCancel" onClick={() => setOpen(false)}>Cancelar</button>
        </div>}
  </div>;
}
