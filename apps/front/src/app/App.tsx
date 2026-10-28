import { FloatingAssistantButton } from "../features/ai/FloatingAssistantButton";
import { PwaUpdatePrompt } from "../pwa/PwaUpdatePrompt";
import { AppRouter } from "./router/AppRouter";
import { ThemeScope } from "../shared/brand/ThemeScope";
export function App() { return <><ThemeScope /><AppRouter /><PwaUpdatePrompt /><FloatingAssistantButton /></>; }
