// Mocked IPC for the e2e build (P2.15). All mock code and data stay in tests/e2e/ (AGENTS.md Edits rule 9).
import { mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import app from "./data/app.json";

mockConvertFileSrc("linux");
mockIPC((command) => {
  switch (command) {
    case "plugin:app|name":
      return app.name;
    case "plugin:app|version":
      return app.version;
    default:
      throw new Error(`e2e: no mock for command ${command}`);
  }
});
