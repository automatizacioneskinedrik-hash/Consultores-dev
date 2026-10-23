import { Users } from "lucide-react";
import UserAvatar from "./UserAvatar";
import "./PersonChips.css";

// Person filter as a row of photo buttons: "Yo", optionally "Equipo", then each person.
export default function PersonChips({ options, value, onChange, label }) {
  return <div className="personChips" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={option.value === value}
      className={`personChip ${option.value === value ? "on" : ""}`} onClick={() => onChange(option.value)} title={option.fullName || option.label}>
      {option.value === "all"
        ? <span className="personChipTeam" aria-hidden="true"><Users size={16} /></span>
        : <UserAvatar name={option.fullName || option.label} email={option.email} picture={option.picture} className="avatarXs" />}
      <span>{option.label}</span>
    </button>)}
  </div>;
}
