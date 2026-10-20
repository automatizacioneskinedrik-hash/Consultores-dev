import { useEffect, useRef, useState } from "react";

// WhatsApp follow-up card: edit the suggested message, choose the country and number, and send it.
// Used in Métricas → Coach, in each lead's card.
const PAIS_CODES = [
  { code: "+57",  iso: "co", label: "Colombia" },
  { code: "+34",  iso: "es", label: "España" },
  { code: "+52",  iso: "mx", label: "México" },
  { code: "+54",  iso: "ar", label: "Argentina" },
  { code: "+51",  iso: "pe", label: "Perú" },
  { code: "+56",  iso: "cl", label: "Chile" },
  { code: "+58",  iso: "ve", label: "Venezuela" },
  { code: "+593", iso: "ec", label: "Ecuador" },
  { code: "+591", iso: "bo", label: "Bolivia" },
  { code: "+595", iso: "py", label: "Paraguay" },
  { code: "+598", iso: "uy", label: "Uruguay" },
  { code: "+53",  iso: "cu", label: "Cuba" },
  { code: "+502", iso: "gt", label: "Guatemala" },
  { code: "+504", iso: "hn", label: "Honduras" },
  { code: "+503", iso: "sv", label: "El Salvador" },
  { code: "+505", iso: "ni", label: "Nicaragua" },
  { code: "+506", iso: "cr", label: "Costa Rica" },
  { code: "+507", iso: "pa", label: "Panamá" },
  { code: "+1809",iso: "do", label: "Rep. Dominicana" },
  { code: "+1787",iso: "pr", label: "Puerto Rico" },
  { code: "+55",  iso: "br", label: "Brasil" },
  { code: "+351", iso: "pt", label: "Portugal" },
  { code: "+1",   iso: "us", label: "EE.UU." },
  { code: "+1",   iso: "ca", label: "Canadá" },
  { code: "+44",  iso: "gb", label: "Reino Unido" },
  { code: "+33",  iso: "fr", label: "Francia" },
  { code: "+49",  iso: "de", label: "Alemania" },
  { code: "+39",  iso: "it", label: "Italia" },
  { code: "+31",  iso: "nl", label: "Países Bajos" },
  { code: "+32",  iso: "be", label: "Bélgica" },
  { code: "+41",  iso: "ch", label: "Suiza" },
  { code: "+61",  iso: "au", label: "Australia" },
  { code: "+81",  iso: "jp", label: "Japón" },
  { code: "+86",  iso: "cn", label: "China" },
  { code: "+91",  iso: "in", label: "India" },
  { code: "+971", iso: "ae", label: "Emiratos Árabes" },
];

function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = PAIS_CODES.find((p) => p.code === value) || PAIS_CODES[0];

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="waCountryWrap" ref={ref}>
      <button type="button" className="waCountryBtn" onClick={() => setOpen((o) => !o)}>
        <img src={`https://flagcdn.com/16x12/${selected.iso}.png`} width="16" height="12" alt={selected.label} className="waCountryFlag" />
        <span>{selected.code}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="waCountryDropdown">
          {PAIS_CODES.map((p, i) => (
            <button
              type="button"
              key={`${p.iso}-${i}`}
              className={`waCountryOption${value === p.code && selected.iso === p.iso ? " active" : ""}`}
              onClick={() => { onChange(p.code); setOpen(false); }}
            >
              <img src={`https://flagcdn.com/16x12/${p.iso}.png`} width="16" height="12" alt={p.label} className="waCountryOptionFlag" />
              <span className="waCountryOptionName">{p.label}</span>
              <span className="waCountryOptionCode">{p.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WaCard({ followUp, onSent, onDismiss }) {
  const [codigo, setCodigo] = useState(followUp.codigoPais || "+34");
  const [telefono, setTelefono] = useState(followUp.telefono || "");
  const [mensaje, setMensaje] = useState(followUp.mensajeSugerido || "");
  const [sending, setSending] = useState(false);
  const msgRef = useRef(null);

  useEffect(() => {
    if (msgRef.current) {
      msgRef.current.style.height = "auto";
      msgRef.current.style.height = msgRef.current.scrollHeight + "px";
    }
  }, [mensaje]);


  const handleSend = async () => {
    const num = telefono.replace(/\D/g, "");
    if (!num) return;
    const codigoLimpio = codigo.replace("+", "");
    window.open(`https://wa.me/${codigoLimpio}${num}?text=${encodeURIComponent(mensaje)}`, "_blank");
    setSending(true);
    await onSent(followUp.id);
  };

  return (
    <div className="waCard" style={{ position: "relative" }}>
      <button className="waCardDismiss" onClick={() => onDismiss(followUp.id)} title="Declinar">✕</button>
      <div className="waCardHeader">
        <div className="waCardName">{followUp.clienteNombre}</div>
        <div className="waCardDate">Recuerda enviar este mensaje en las próximas 24 hrs</div>
      </div>
      <textarea
        ref={msgRef}
        className="waCardMsg"
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        placeholder="Mensaje de seguimiento..."
        style={{ overflow: "hidden", resize: "none" }}
      />
      <div className="waCardPhone">
        <CountrySelect value={codigo} onChange={setCodigo} />
        <input
          className="waCardNumber"
          type="tel"
          placeholder="Número"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
      </div>
      <button
        className="waCardBtn"
        onClick={handleSend}
        disabled={sending || !telefono.trim()}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {sending ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}
