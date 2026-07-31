// Tiny persisted settings (PIN etc) — a JSON file in the app's documents dir,
// so we don't need an AsyncStorage dependency.
import * as FileSystem from "expo-file-system/legacy";

const FILE = FileSystem.documentDirectory + "aiassist-settings.json";

export async function loadSettings() {
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(FILE));
  } catch {
    return {};
  }
}

export async function saveSettings(patch) {
  const cur = await loadSettings();
  const next = { ...cur, ...patch };
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(next));
  } catch {}
  return next;
}
