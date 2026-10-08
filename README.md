# Video Feed — React Native + Expo

Aplicación móvil multiplataforma (**iOS y Android**) desarrollada con **React Native, Expo, TypeScript y Expo Router** para descubrir y reproducir vídeos de tus canales favoritos de YouTube, gestionar suscripciones locales y mantener el progreso de reproducción de cada vídeo entre sesiones.

---

## Características principales

- **Pestaña Feed**:
  - Muestra los últimos vídeos publicados por tus canales favoritos ordenados del más reciente al más antiguo.
  - Barra de filtro rápido por canal favorito.
  - Indicador visual de progreso en la miniatura de cada vídeo (barra inferior + etiqueta de minuto actual o `"Visto"`).
  - Soporte para **Pull-to-refresh**, **caché local configurable** y **modo offline** con aviso cuando se muestran datos almacenados localmente.
- **Pestaña Buscar**:
  - Búsqueda de canales de YouTube con **debounce** configurable (`400 ms`) para evitar peticiones innecesarias.
  - Gestión rápida para añadir o quitar canales de favoritos con persistencia local inmediata.
- **Reproductor embebido (`VideoPlayer`)**:
  - Basado en la **YouTube IFrame Player API** oficial mediante `react-native-webview`.
  - Recupera automáticamente el progreso almacenado y continúa la reproducción desde el punto donde se dejó.
  - Guarda el progreso periódicamente (por defecto cada `10 segundos`, configurable en `src/config/config.ts`), al pausar y al salir del reproductor.
  - Permite reiniciar el vídeo desde el principio en cualquier momento.

---

## Cumplimiento de Políticas y Términos de Servicio de YouTube

De acuerdo con los **Términos de Servicio de los Servicios de API de YouTube (YouTube API Services Terms of Service)** y las políticas para desarrolladores:

1. **Publicidad y reproductor embebido**:
   - Está estrictamente prohibido bloquear, interceptar, modificar o suprimir los anuncios servidos por YouTube dentro del reproductor embebido (`YT.Player`), así como superponer capas que oculten los controles nativos o la atribución de YouTube.
   - No existe ningún parámetro oficial de la API de YouTube que permita desactivar la publicidad en vídeos monetizados; aunque se utiliza el dominio oficial de privacidad mejorada (`https://www.youtube-nocookie.com`) junto con `origin` válido para cumplir los requisitos de identidad del reproductor embebido, los anuncios gestionados por YouTube se respetan íntegramente.
2. **Sin descarga ni extracción de flujos**:
   - La aplicación no descarga flujos de audio/vídeo ni almacena contenido multimedia; únicamente guarda metadatos básicos de canales favoritos y marcas de tiempo (`position`, `duration`, `updatedAt`) en almacenamiento local (`AsyncStorage`).

---

## Configuración de Variables de Entorno y Seguridad de API

### 1. Configurar `EXPO_PUBLIC_YOUTUBE_API_KEY`

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Habilita la **YouTube Data API v3**.
3. Crea una credencial de tipo **Clave de API (API Key)**.
4. Copia el archivo `.env.example` a `.env` en la raíz del proyecto:
   ```bash
   cp .env.example .env
   ```
5. Edita `.env` e introduce tu clave:
   ```env
   EXPO_PUBLIC_YOUTUBE_API_KEY=AIzaSyTuClaveRealAqui
   ```

> **Nota de seguridad**: El archivo `.env` está incluido en `.gitignore` para evitar subir claves al repositorio. En aplicaciones móviles distribuidas públicamente en producción, las variables `EXPO_PUBLIC_*` quedan accesibles en el bundle del cliente; por ello se recomienda:
> - Restringir la API Key en Google Cloud Console por identificador de paquete iOS (`bundleIdentifier`) / firma SHA-1 de Android (`package`) y limitar su alcance exclusivamente a **YouTube Data API v3**.
> - O bien, en entornos de alto tráfico, situar un pequeño **backend proxy / Edge Function** intermedio que almacene la clave en el servidor, aplique caché compartida y controle cuotas por IP/usuario.

---

## Estructura del Proyecto

```text
src/
├── app/
│   ├── _layout.tsx          # Configuración de pestañas (Feed y Buscar) con Expo Router
│   ├── index.tsx            # Redirección inicial a /feed
│   ├── feed.tsx             # Pantalla principal del Feed de vídeos
│   ├── search.tsx           # Pantalla de búsqueda y gestión de canales favoritos
│   └── player/
│       └── [id].tsx         # Pantalla del reproductor de vídeo y detalles
├── components/
│   ├── ChannelCard.tsx      # Tarjeta de canal con avatar, descripción y botón de favorito
│   ├── FavoriteButton.tsx   # Botón reutilizable para seguir/dejar de seguir un canal
│   ├── UIStates.tsx         # Skeletons de carga, EmptyState, ErrorState y OfflineBanner
│   ├── VideoCard.tsx        # Tarjeta de vídeo con miniatura 16:9, duración y barra de progreso
│   └── VideoPlayer.tsx      # Reproductor embebido WebView + YouTube IFrame Player API
├── config/
│   └── config.ts            # Configuración centralizada (colores, tamaños, intervalos, caché)
├── hooks/
│   ├── useChannelSearch.ts  # Búsqueda con debounce y control de errores
│   ├── useFavorites.ts      # Estado sincronizado de canales favoritos
│   ├── useFeed.ts           # Carga del Feed con caché local y soporte offline
│   ├── usePlaybackProgress.ts # Seguimiento y persistencia periódica del minutaje
│   └── useThemeColors.ts    # Soporte para modo oscuro y claro desde config.ts
├── services/
│   ├── storage.ts           # Capa de persistencia local desacoplada sobre AsyncStorage
│   └── youtube.ts           # Cliente de YouTube Data API v3 con deduplicación y manejo de errores
├── types/
│   └── youtube.ts           # Tipos de dominio y respuestas de la API
├── utils/
│   ├── debounce.ts          # Utilidad de debounce cancelable
│   └── format.ts            # Formateo de duraciones ISO 8601, fechas relativas y cálculos de progreso
└── __tests__/               # Suite de tests unitarios y de integración (Jest + RNTL)
```

---

## Comandos disponibles

```bash
# Instalar dependencias
npm install

# Iniciar el servidor de desarrollo de Expo
npm start

# Ejecutar tests automatizados
npm test

# Comprobar tipos con TypeScript
npm run typecheck

# Generar carpeta nativa android/ (Expo Prebuild)
npm run prebuild:android

# Generar APK en local (Release) — Requiere JDK 17+ y Android SDK
npm run apk:local

# Generar APK en local (Debug) — Requiere JDK 17+ y Android SDK
npm run apk:debug

# Generar APK en la nube con Expo EAS Build
npm run apk:eas
```

