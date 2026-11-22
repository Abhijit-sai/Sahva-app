# Sahva

A multilingual messaging and live translated calling app for the web and Android. The React client shares the same dual-track audio engine across platforms. Express handles authenticated chat, calls and Gemini translation. PostgreSQL stores durable state and S3 holds audio and avatars.

## Local development

Use Node 22, npm, PostgreSQL 16, a private S3 bucket, Clerk development keys and a Gemini API key. Copy .env.example to .env and configure the services. Start with npm ci, npm run db:migrate and npm run dev. Open http://localhost:3000.

Run npm run lint and npm run build for TypeScript, Vite and server bundles. Run npm run db:generate after schema changes and review the generated SQL.

- [Deploy the website and backend](DEPLOYMENT.md)
- [Build, install and test the Android APK](ANDROID_TEST_APK.md)
