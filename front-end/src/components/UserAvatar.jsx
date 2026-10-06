import { useState } from "react";
import "./UserAvatar.css";

function initialsFor(name, email) {
  const emailName = (email || "").split("@")[0].replace(/[._+-]+/g, " ");
  const source = (name || emailName || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

export default function UserAvatar({ name = "", email = "", picture = "", className = "" }) {
  const [failedPicture, setFailedPicture] = useState("");

  const label = name || email || "Usuario";

  return (
    <span className={`profileAvatar ${className}`.trim()} role="img" aria-label={`Foto de ${label}`}>
      {picture && failedPicture !== picture
        ? <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setFailedPicture(picture)} />
        : <span className="profileAvatarInitials" aria-hidden="true">{initialsFor(name, email)}</span>}
    </span>
  );
}
