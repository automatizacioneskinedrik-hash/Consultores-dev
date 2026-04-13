# Arquitectura del Sistema - KINEDRIꓘ

Este documento describe la arquitectura técnica, el flujo de datos y el sistema de permisos de la plataforma KINEDRIꓘ.

## 🏗️ Resumen de Arquitectura

La aplicación sigue una arquitectura de **Monorepo** dividida en un cliente de frontend moderno y un servidor de backend robusto, integrando servicios de Inteligencia Artificial y computación en la nube.

- **Frontend**: React 18 + Vite (SPA).
- **Backend**: Node.js + Express (API REST).
- **Infraestructura**: Google Cloud Platform (Cloud Build, GCS, BigQuery).
- **Base de Datos y Auth**: Firebase (Firestore para base de datos NoSQL y sistema de autenticación personalizado).
- **IA**: OpenAI API (Whisper para transcripción y GPT-4o para análisis).

---

## 🚦 Sistema de Roles y Permisos

La plataforma utiliza un sistema de **Role-Based Access Control (RBAC)** gestionado a través de Firestore. Los roles se validan mediante headers personalizados (`x-admin-email` y `x-auth-token`) en cada petición al backend.

### Roles Disponibles:
1.  **Superadmin**:
    *   Acceso total al sistema.
    *   Gestión de prompts maestros para la IA.
    *   Administración global de usuarios y configuraciones críticas.
    *   *Master Superadmin Email*: `adminkinedrik@eadic.com`.
2.  **Admin**:
    *   Gestión de configuraciones de correo (CC/BCC).
    *   Visualización de reportes avanzados.
    *   Administración de usuarios de nivel estándar.
3.  **Consultor (User)**:
    *   Subida de audios de reuniones.
    *   Visualización de sus propios análisis y reportes de feedback.

---

## 🔄 Flujo de Trabajo: Análisis de Reunión

El proceso de subir una reunión y recibir feedback es el núcleo del sistema:

1.  **Solicitud de Subida**: El frontend solicita una **Signed URL** al backend para subir el archivo de audio directamente a Google Cloud Storage (seguridad y eficiencia).
2.  **Carga a GCS**: El archivo se aloja en un bucket de GCS bajo una ruta estructurada: `audios/{userId}/{yyyy}/{mm}/{dd}/{id}{ext}`.
3.  **Notificación de Completado**: El frontend avisa al backend que la subida terminó.
4.  **Procesamiento de Audio**:
    *   El backend descarga el audio a un directorio temporal.
    *   Si el archivo supera los 25MB, se comprime automáticamente usando **Fluent-ffmpeg** (32kbps MP3) para cumplir con los límites de la API.
5.  **Transcripción IA**: Se envía el audio a **OpenAI Whisper-1** para obtener la transcripción textual y la duración exacta.
6.  **Análisis Metodológico**: 
    *   Se recupera el **Prompt Maestro** activo de la base de datos.
    *   La transcripción se analiza con **GPT-4o** aplicando la metodología *“Entrevista Estrella — 5 Fases del Diseño de Decisión”*.
    *   Se extraen métricas como temperatura del cliente, resumen ejecutivo, scorecard de habilidades y puntos de mejora accionables.
7.  **Persistencia**: El análisis resultante se guarda en la colección `meetings_analysis` de Firestore.
8.  **Entrega**: Se envía un correo electrónico con diseño premium (HTML/CSS embebido) al consultor y a los destinatarios configurados en CC/BCC.

---

## 🛠️ Stack Tecnológico Detallado

### Backend (`/back-end`)
- **Express**: Framework web.
- **Firebase Admin SDK**: Integración con Firestore.
- **Google Cloud Storage SDK**: Gestión de archivos en la nube.
- **OpenAI SDK**: Interfaz con modelos de lenguaje y audio.
- **Nodemailer**: Motor de envío de correos SMTP.
- **Multer**: Manejo de subidas temporales.
- **BigQuery**: Preparado para análisis de datos a gran escala.

### Frontend (`/front-end`)
- **Vite**: Herramienta de construcción y dev server ultra rápido.
- **React Router**: Gestión de navegación y guardas de seguridad.
- **Vanilla CSS**: Sistema de diseño personalizado con enfoque premium y glassmorfismo.
- **LocalStorage**: Caché de sesión de usuario de corta duración.

---

## 📂 Estructura de Datos (Firestore)

- **`users`**: Documentos de identidad de usuario (email, name, role, status, authToken).
- **`meetings_analysis`**: Histórico de transcripciones y resultados del motor de IA.
- **`settings`**: Configuraciones globales (ej. `email_config`).
- **`prompts`**: Repositorio de instrucciones para el motor de IA, permitiendo actualizar la lógica de feedback sin tocar el código.

---

## 🚀 Despliegue

El proyecto está configurado para despliegue continuo mediante **Google Cloud Build** (`cloudbuild.yaml`). El frontend se sirve típicamente tras un servidor Nginx, mientras que el backend corre como un servicio de Node.js en contenedores.
