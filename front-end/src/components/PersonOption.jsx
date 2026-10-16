import { TeamOutlined } from "@ant-design/icons";
import UserAvatar from "./UserAvatar";
import "./PersonOption.css";

// A person in a selector: Google photo (or initials) beside the name. "all" shows a group icon.
export default function PersonOption({ option, allLabel = "Todos" }) {
  if (option?.value === "all") return <span className="personOption"><span className="personAllIcon" aria-hidden="true"><TeamOutlined /></span>{allLabel}</span>;
  return <span className="personOption">
    <UserAvatar name={option?.label} email={option?.value} picture={option?.picture} className="avatarSm" />
    <span className="personOptionName">{option?.label}</span>
  </span>;
}
