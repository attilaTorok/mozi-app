/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_TMDB_API_KEY?: string
  /** 4-digit PIN of the Hub vault lock. */
  readonly VITE_APP_PIN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
