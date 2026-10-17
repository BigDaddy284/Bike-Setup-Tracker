// API exposed by electron/preload.ts.
interface DesktopApi {
  /** Shows an Open dialog for a .json backup; resolves to its text, or null if cancelled. */
  openBackup(): Promise<string | null>;
  /** Shows a Save dialog (defaulting to Documents); resolves to the saved path, or null if cancelled. */
  saveBackup(defaultFileName: string, contents: string): Promise<string | null>;
}

interface Window {
  desktop: DesktopApi;
}
