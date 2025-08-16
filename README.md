# WordlePal - Ionic Vue Project

A modern Ionic Vue application with Firebase Hosting support.

## Tech Stack

- **Ionic 7** - Cross-platform UI framework
- **Vue 3** - Progressive JavaScript framework with Composition API
- **TypeScript** - Type-safe JavaScript
- **Capacitor** - Native runtime for web apps
- **Vite** - Fast build tool and dev server
- **Firebase Hosting** - Web hosting platform

## Project Structure

```
src/
├── components/          # Reusable Vue components
├── router/             # Vue Router configuration
├── views/              # Page components
├── theme/              # Global styling and Ionic CSS variables
└── main.ts             # Application entry point
```

## Getting Started

### Prerequisites

- Node.js (version 16 or later)
- npm or yarn
- Firebase CLI (for deployment)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Ionic CLI globally (if not already installed):
   ```bash
   npm install -g @ionic/cli
   ```

### Development

Start the development server:
```bash
npm run dev
# or
ionic serve
```

The app will be available at `http://localhost:8100`

### Building for Production

Build the project:
```bash
npm run build
```

This creates optimized files in the `dist` directory.

### Firebase Hosting Setup

1. Install Firebase CLI globally:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase project:
   ```bash
   npm run firebase:init
   ```

4. Update `.firebaserc` with your Firebase project ID:
   ```json
   {
     "projects": {
       "default": "your-firebase-project-id"
     }
   }
   ```

5. Deploy to Firebase:
   ```bash
   npm run deploy
   ```

### Mobile Development

Add mobile platforms using Capacitor:

```bash
# Add iOS platform
ionic capacitor add ios

# Add Android platform  
ionic capacitor add android

# Build and sync
ionic capacitor build ios
ionic capacitor build android
```

## Available Scripts

- `npm run dev` - Start development server with Vite
- `npm run serve` - Start development server with Ionic CLI
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run deploy` - Build and deploy to Firebase
- `npm run lint` - Run ESLint
- `npm run test:unit` - Run unit tests with Vitest
- `npm run test:e2e` - Run E2E tests with Cypress

## Configuration Files

- `firebase.json` - Firebase hosting configuration
- `.firebaserc` - Firebase project settings
- `capacitor.config.ts` - Capacitor configuration
- `ionic.config.json` - Ionic CLI configuration
- `vite.config.ts` - Vite build configuration

## Learn More

- [Ionic Framework Documentation](https://ionicframework.com/docs)
- [Vue 3 Documentation](https://v3.vuejs.org/)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
