import type { DesktopSettings } from "./contract.ts";

export type PreviewPersistenceResult =
  | {
      ok: true;
      settings: DesktopSettings;
      message: string;
    }
  | {
      ok: false;
      settings: DesktopSettings;
      message: string;
    };

function persistenceErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "L’enregistrement local a échoué.";
}

export async function persistPreviewSettings({
  candidate,
  persisted,
  save,
}: {
  candidate: DesktopSettings;
  persisted: DesktopSettings;
  save: (settings: DesktopSettings) => Promise<DesktopSettings>;
}): Promise<PreviewPersistenceResult> {
  try {
    return {
      ok: true,
      settings: await save(candidate),
      message: "Adresse locale enregistrée.",
    };
  } catch (error) {
    return {
      ok: false,
      settings: {
        ...candidate,
        previewUrl: persisted.previewUrl,
      },
      message: `L’adresse locale n’a pas été enregistrée. La dernière valeur valide a été restaurée. ${persistenceErrorMessage(error)}`,
    };
  }
}
