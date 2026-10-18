import { flow as kommoToTelegram } from "./kommo-to-telegram";
import { flow as tuitionToTelegram } from "./tuition-to-telegram";
import { flow as websiteFormToTelegram } from "./website-form-to-telegram";
import type { Flow } from "./types";

// Add new integration types here. Nothing else needs to change.
export const flows: Flow[] = [kommoToTelegram, tuitionToTelegram, websiteFormToTelegram];

export const flowByType = (type: string) => flows.find((f) => f.type === type);
export const flowByHook = (hook: string) => flows.find((f) => f.hook === hook);
