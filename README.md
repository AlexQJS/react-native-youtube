# Video Feed — React Native + Expo

A cross-platform mobile application (**Android & iOS**) built with **React Native, Expo (SDK 57), TypeScript, and Expo Router** to follow your favorite YouTube channels, watch videos and Shorts with a persistent floating mini-player, track playback progress, and manage watch history locally.

---

## Key Features

- **Feed (`/feed`)**:
  - Chronological feed of the latest uploads from your favorite channels.
  - Filter by channel chips and toggle between **Videos** (16:9) and **Shorts** (9:16 2-column grid).
  - Visual progress bars and completion badges on video thumbnails.
  - Pull-to-refresh, local TTL caching, offline mode fallback, and automatic RSS/web fallback when no API key is configured or quota is reached.
- **Search (`/search`)**:
  - Debounced search (`400 ms`) across YouTube **Channels** and **Videos** (`All`, `Videos`, `Channels` filters).
  - Follow/unfollow channels with instant local persistence (`AsyncStorage`).
- **Watch History (`/history`)**:
  - Automatically logs watched videos (up to 200 items) with resume position and completion status.
  - Remove individual entries or clear the entire history.
- **Settings & Analytics (`/config`)**:
  - **Theme**: Switch between **Dark** and **Light** modes.
  - **Lock-Screen Playback**: Keep video audio playing when the device screen is locked (powered by an Android Foreground Media Service via a custom Expo Config Plugin).
  - **Weekly Watch Time**: 7-day bar chart with total watch time, daily average, and peak day metrics.
- **Persistent Video Player & Mini-Player**:
  - Built on the official **YouTube IFrame Player API** (`youtube-nocookie.com`) inside `react-native-webview`.
  - Minimize any playing video into a floating **Mini-Player** while navigating across tabs.
  - Auto-saves playback progress periodically (`10s`), on pause, and on exit.
  - **Sleep Timer** (`5m`, `15m`, `30m`, `1h`, `2h`, or `End of video`) with automatic screen lock support on Android (`DevicePolicyManager`).
  - Expandable video description and **YouTube comments & replies** viewer.

---

## Tech Stack

- **Framework**: React Native `0.86` + Expo `~57.0` + React `19`
- **Navigation**: Expo Router (File-based routing + Custom Tab Shell)
- **Storage**: `@react-native-async-storage/async-storage` (in-memory cache + persistent storage)
- **Player**: `react-native-webview` + `expo-keep-awake` + Custom Native Module (`DeviceLockModule`)
- **Testing**: Jest + React Native Testing Library (`@testing-library/react-native`)

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your **YouTube Data API v3** key inside `.env`:

```env
EXPO_PUBLIC_YOUTUBE_API_KEY=your_youtube_api_key_here
EAS_SKIP_AUTO_FINGERPRINT=1
```

> **Note**: Create your key in the [Google Cloud Console](https://console.cloud.google.com/) with **YouTube Data API v3** enabled. For production builds, restrict the key by Android package (`com.youtubefeed.app`) / iOS bundle identifier and API scope.

### 3. Run the app

```bash
# Start Expo development server
npm start

# Run on Android / iOS / Web
npm run android
npm run ios
npm run web
```

---

## Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Start the Expo development server |
| `npm test` | Run unit and integration tests with Jest |
| `npm run typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm run prebuild:android` | Generate native `android/` project via Expo Prebuild |
| `npm run apk:debug` | Build a local Debug APK (`android/gradlew assembleDebug`) |
| `npm run apk:local` | Build a local Release APK (`android/gradlew assembleRelease`) |
| `npm run apk:eas` | Build an Android APK in the cloud using Expo EAS Build |

---

## Project Structure

```text
├── plugins/
│   └── withDeviceLock.js           # Expo config plugin (Android foreground playback & device lock)
└── src/
    ├── app/
    │   ├── _layout.tsx             # Root layout, custom bottom navigation & PersistentPlayerHost
    │   ├── index.tsx               # Initial redirect to /feed
    │   ├── feed.tsx                # Main video & Shorts feed screen
    │   ├── search.tsx              # Channel & video search screen
    │   ├── history.tsx             # Watch history screen
    │   ├── config.tsx              # Theme, lock-screen playback & weekly watch stats screen
    │   └── player/[id].tsx         # Direct video player route
    ├── components/
    │   ├── ChannelCard.tsx         # Channel item with avatar, stats, and follow button
    │   ├── FavoriteButton.tsx      # Reusable follow/unfollow button
    │   ├── PersistentPlayerHost.tsx# Fullscreen & floating mini-player container + comments
    │   ├── SplashScreen.tsx        # Animated brand splash screen
    │   ├── UIStates.tsx            # Skeletons, EmptyState, ErrorState, and OfflineBanner
    │   ├── VideoCard.tsx           # 16:9 & 9:16 video card with progress bar
    │   └── VideoPlayer.tsx         # WebView YouTube IFrame Player + Sleep Timer controls
    ├── config/
    │   └── config.ts               # Centralized theme, layout, cache, playback & API settings
    ├── context/
    │   └── PlayerContext.tsx       # Global active video & mini-player state
    ├── hooks/                      # Custom hooks (feed, search, favorites, progress, history, timer, comments, theme)
    ├── services/
    │   ├── deviceLock.ts           # JS bridge for native Android lock-screen & background service
    │   ├── storage.ts              # AsyncStorage persistence layer with reactive listeners
    │   └── youtube.ts              # YouTube Data API v3 client + RSS/web fallback & deduplication
    ├── types/
    │   └── youtube.ts              # Domain & API TypeScript interfaces
    ├── utils/
    │   ├── debounce.ts             # Cancellable debounce helper
    │   └── format.ts               # Duration, date, view count & weekly analytics formatters
    └── __tests__/                  # Jest unit & integration test suites
```

---

## YouTube API Services Compliance

- **Official Embedded Player**: Playback exclusively uses the official **YouTube IFrame Player API** (`https://www.youtube-nocookie.com`) without blocking or modifying YouTube ads or native attributions.
- **No Stream Downloading**: The app does not download or store audio/video streams; only channel metadata, watch history, and playback timestamps (`position`, `duration`, `updatedAt`) are stored locally via `AsyncStorage`.
