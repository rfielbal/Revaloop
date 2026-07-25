import type { DesktopSettings } from "./contract.ts";

export type ControlPlanePersistenceResult =
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

export async function persistControlPlaneSettings({
  candidate,
  persisted,
  save,
}: {
  candidate: DesktopSettings;
  persisted: DesktopSettings;
  save: (settings: DesktopSettings) => Promise<DesktopSettings>;
}): Promise<ControlPlanePersistenceResult> {
  try {
    return {
      ok: true,
      settings: await save(candidate),
      message: "Instance enregistrée.",
    };
  } catch (error) {
    return {
      ok: false,
      settings: {
        ...candidate,
        controlPlaneUrl: persisted.controlPlaneUrl,
      },
      message: `L’adresse n’a pas été enregistrée. La dernière valeur valide a été restaurée. ${persistenceErrorMessage(error)}`,
    };
  }
}
