# KINEDRIK UPLOADER - Contexto del Proyecto

## Resumen Ejecutivo

**KINEDRIK UPLOADER** es una interfaz React + Vite para captura y carga de archivos de audio. Los audios serán analizados con GPT Whisper para transcripción y extracción de insights. El proyecto incluye:

- Sistema de login/autenticación (email-based).
- Página de carga de audios con progreso simulado.
- Panel de administración (Gestión de Usuarios).
- Barra lateral con navegación y estado del usuario (nombre + punto verde online).

---

## Stack Tecnológico

- **Frontend**: React 18 + Vite (build tool)
- **Routing**: React Router v6
- **Almacenamiento (client)**: localStorage (hoy), preparado para IndexedDB o API Backend
- **Styling**: CSS vanilla (BEM-ish)
- **Backend**: Por definir (Node/Express recomendado para MVP)
- **Transcripción**: GPT Whisper (aún no integrado; se planea en backend)
- **Storage**: Por definir (S3, Firebase Storage, disco local para MVP)

---

## Estructura del Proyecto

```
c:\Users\Admin\Desktop\KINEDRIK UPLOADER\
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx          (entry point)
│   ├── App.jsx           (routing + auth guards)
│   ├── App.css           (estilos globales + layout)
│   ├── index.css         (reset CSS)
│   ├── assets/
│   ├── components/
│   │   └── Sidebar.jsx   (navbar fija izquierda + badge usuario)
│   ├── context/
│   ├── pages/
│   │   ├── Login.jsx     (form de login)
│   │   ├── Login.css
│   │   ├── Upload.jsx    (carga de audios - INTERFAZ PRINCIPAL)
│   │   ├── Upload.css    (vacío, usa App.css)
│   │   ├── Admin.jsx     (gestión de usuarios)
│   │   └── Admin.css
│   ├── styles/
│   │   └── Sidebar.css
│   └── utils/
│       └── user.js       (helpers para leer/guardar usuario de localStorage)
├── public/
└── eslint.config.js
```

---

## Flujo de Autenticación & Rutas

### Auth Guard (App.jsx)

```javascript
const isAdmin = email === "admin.eadic@gmail.com";
```

### Rutas Protegidas

1. `/login` → pública (si no logueado, redirige aquí)
2. `/upload` → protegida (solo usuarios logueados)
3. `/admin` → solo admin (verifica email específico)
4. `/` → redirige a `/login`

---

## Página de Carga (Upload.jsx) - INTERFAZ PRINCIPAL

### Estado Actual (Simulado)

La interfaz es funcional pero NO conecta a backend. Los audios se guardan en memoria (estado React) y se pierden al refrescar.

#### Componentes UI

1. **Sidebar izquierda** (fija, 215px)
   - Logo KINEDRIK con barras de colores (SVG inline)
   - Botones: "Subir Archivo" (active cuando estas en /upload), "Gestionar Usuarios" (solo admin)
   - Badge inferior con nombre del usuario en blanco + punto verde (estado online)

2. **Área principal (Upload)**
   - Títulos: "Transforma tus reuniones en **insights** accionables"
   - Subtítulo con contexto
   - **Drop Zone**: área para drag-and-drop o click para seleccionar archivo
     - Icono micrófono (SVG)
     - Texto: "Arrastra tu archivo de audio aquí o haz clic para buscar"
   - **Barra de progreso** (solo visible después de seleccionar archivo)
     - Nombre archivo | porcentaje
     - Barra azul con animación
     - Estado (SUBIENDO... / COMPLETADO) | MB cargado / MB total
   - **Footer**: copyright

#### Flujo de Usuario (Hoy)

1. Selecciona archivo (input hidden + click en drop zone)
2. `handleFile()` guarda en estado `fileMeta`
3. `simulateUpload()` avanza la barra cada 40ms (variable fake `uploaded += chunk`)
4. Modal de confirmación: "¿Desea enviarlo ahora?"
   - Sí → muestra modal de éxito
   - No → resetea todo
5. Cierre de modal → reset de estado

#### Estado React (Upload.jsx)

```javascript
const [user, setUser] = useState(() => getUser()); // usuario actual
const [fileMeta, setFileMeta] = useState(null); // { name, size, type, ...}
const [progress, setProgress] = useState(0); // 0-100 %
const [status, setStatus] = useState(""); // "SUBIENDO..." / "COMPLETADO"
const [showModal, setShowModal] = useState(false); // confirmación
const [showSuccessModal, setShowSuccessModal] = useState(false); // éxito
```

#### Funciones Clave

- `handleFile(file)` → inicia upload falso, guarda metadata
- `simulateUpload(file)` → avanza progreso cada 40ms (fake)
- `handleYes()` → confirma envío (hoy solo simula)
- `handleNo()` → cancela y resetea
- `onDrop()` → drag-and-drop handler
- `onDragOver()` → prevenir default

---

## Usuario (Sistema Dinámico)

### Util: `src/utils/user.js`

Interfaz centralizada para leer/guardar usuario (preparada para API/BD):

```javascript
export function getUser() {
  // Lee de localStorage: kinedrix_name, kinedrix_email
  // Devuelve { fullName, email }
}

export function setUser(user) {
  // Guarda en localStorage
}

export function clearUser() {
  // Borra ambas claves
}
```

### Flujo de Usuario

1. En Login.jsx (pseudocódigo):
   - Input email → `localStorage.setItem('kinedrix_email', email)`
   - Backend devuelve nombre → `localStorage.setItem('kinedrix_name', fullName)`

2. En Upload.jsx:
   - `const [user, setUser] = useState(() => getUser())`
   - Ese nombre aparece en la badge de Sidebar

3. En Sidebar.jsx:
   - Lee `getUser()` y muestra `storedName` en badge

### Test Rápido (DevTools Console)

```javascript
localStorage.setItem("kinedrix_email", "admin.eadic@gmail.com");
localStorage.setItem("kinedrix_name", "Monica Alexander");
// Refrescar la página o navegar a /upload
```

---

## Estilos & Layout

### Sidebar (fija, 215px)

- Fondo navy `#040025`
- Items con hover (fondo azul translúcido)
- Badge abajo con nombre en blanco + punto verde
- Border-bottom en header

### Main Content

- `margin-left: 215px` en `.appShell`
- Ancho: `calc(100% - 215px)` para evitar overflow horizontal
- Fondo: `#e7e7e7` (off-white)

### Drop Zone

- Border azul `#0040a4`, border-radius 26px
- Padding 40px, ancho 720px max
- Centrado con flexbox
- Cursor pointer

### Barra de Progreso

- Altura 10px, fondo gris claro
- Fill azul con transition 0.25s
- Layout flex para espaciar info

### Avatar (Sidebar Badge)

- Circular (border-radius 50%)
- Fondo navy
- Nombre en blanco (visible)
- Punto verde (10px) con sombra

---

## Lógica de Carga de Audio (SIMULADA)

### HOY: Simulación

```javascript
const simulateUpload = (file) => {
  let uploaded = 0;
  const total = file.size;
  const chunk = total / 100;

  const interval = setInterval(() => {
    uploaded += chunk;
    const percent = Math.min(Math.round((uploaded / total) * 100), 100);
    setProgress(percent);

    if (percent >= 100) {
      clearInterval(interval);
      setStatus("COMPLETADO");
      setShowModal(true); // pide confirmación
    }
  }, 40);
};
```

**Realidad**: avanza la barra en línea recta en ~4 segundos, sin enviar nada al servidor.

### PRÓXIMO: Integración Real (Recomendado)

#### Opción A: Subida al Backend (Recomendado para Producción)

1. Cliente envía con `FormData` usando XHR (soporta progreso real)
2. Backend recibe en `/api/upload`, guarda en storage (S3 / disco)
3. Backend encoloa job de transcripción (RabbitMQ / Redis)
4. Worker descarga audio, ejecuta Whisper, guarda resultado en BD
5. Cliente polling / websocket para saber cuándo termina

#### Opción B: Persistencia Local (Para Offline / Caché)

- Guardar `Blob` en IndexedDB en el navegador
- Enviar después cuando hay conectividad
- Menos ideal para audios grandes (límites IndexedDB ~50MB por origen)

---

## Requisitos Pendientes (Para Whisper + Backend)

1. **Backend API** (`/api/upload`)
   - POST multipart/form-data
   - Guarda archivo
   - Encoloa job
   - Devuelve { ok: true, uploadId: "uuid" }

2. **Storage Backend**
   - S3, Firebase Storage, o disco local (MVP)
   - URL accesible o ruta local para worker

3. **Worker / Queue**
   - Consume uploads
   - Llama a Whisper (API o local con librería)
   - Guarda transcripción + metadata en BD

4. **Webhook / Polling**
   - Cliente notificado cuando transcripción lista
   - Fetch `/api/uploads/:id/result` o websocket

5. **Base de Datos**
   - Tabla: uploads (id, userId, fileName, status, createdAt, resultUrl, ...)
   - Tabla: users (id, email, fullName, role, ...)

---

## Variables de Entorno (Recomendado)

```bash
# Frontend (.env vite)
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WHISPER_API_KEY=sk-...  # si usas servicio externo

# Backend (.env node)
DATABASE_URL=postgresql://...
S3_BUCKET=...
S3_REGION=...
WHISPER_MODEL=base  # o small, medium, large
WORKER_QUEUE_URL=...
```

---

## Próximos Pasos (Recomendados)

1. **Backend MVP** (Node/Express)
   - Endpoint POST `/api/upload` con multer
   - Almacenar en disco local o S3
   - Encolad placeholder (sin worker real)

2. **Integración Frontend**
   - Reemplazar `simulateUpload()` por XHR/fetch real
   - Mostrar progreso real de upload
   - Polling o websocket para resultado

3. **Worker + Whisper**
   - Node worker escucha cola
   - Descarga audio
   - Ejecuta Whisper (local o API)
   - Guarda resultado

4. **UI de Resultados**
   - Nueva ruta `/results` o modal después de transcripción
   - Mostrar transcripción, timestamps, insights generados

---

## Contactos & Configuración Admin

- **Email Admin**: `admin.eadic@gmail.com` (fijo en código, cambiar si necesario)
- **Rutas Admin**: `/admin` (solo ese email puede acceder)
- **DB Admin**: TBD (cuando tengamos BD real)

---

## Archivos Clave para Revisar

1. `src/App.jsx` - Routing y guards
2. `src/pages/Upload.jsx` - Interfaz de carga (TODO: integrar real)
3. `src/components/Sidebar.jsx` - Navegación y badge usuario
4. `src/utils/user.js` - Gestión de usuario (listo para API)
5. `src/App.css` - Layout y estilos globales

---

## Notas Importantes

- **localStorage es inseguro**: No guardes tokens o datos sensibles. Migrarse a cookies HttpOnly + JWT.
- **Límites de Upload**: Configurar en cliente (input accept="audio/\*") y servidor (multer limits).
- **CORS**: Backend debe permitir requests desde el frontend (localhost:5173 en dev).
- **Audio Formats**: Whisper soporta MP3, WAV, M4A, Ogg. Validar en cliente y servidor.
- **Escalado**: Para muchos usuarios, IndexedDB y localStorage son ineficientes. Usar BD real (PostgreSQL recomendado).

---

## ¿Preguntas para GPT?

Con este contexto, puedes preguntarle a GPT:

- "¿Cómo integrar Whisper con Node/Express?"
- "¿Cómo hacer real el upload con progreso?"
- "¿Cómo configurar una cola de trabajos?"
- "¿Cuál es el flujo ideal para autenticación (JWT)?"
- "¿Cómo estructurar la BD?"
- Y cualquier otra sobre la interfaz, el flujo o la arquitectura.

---

**Última actualización**: 20 de febrero de 2026
**Estado**: MVP con UI funcional, backend pendiente
