import { useState } from "react";

import type {
  ProductAssistantHistoryItem,
  ProductAssistantResponse,
} from "@velora/contracts";

import {
  apiRequest,
  jsonBody,
} from "../../core/api/apiClient";

export function useProductAssistant(companyId: string) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ProductAssistantHistoryItem[]>([]);
  const [result, setResult] = useState<ProductAssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (trimmed: string) => {
    if (trimmed.length < 2) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<ProductAssistantResponse>(
        "/api/customer/assistant/products",
        {
          method: "POST",
          body: jsonBody({
            companyId,
            message: trimmed,
            history: history.slice(-8),
          }),
        },
      );

      setResult(response);
      setHistory((current) =>
        [
          ...current,
          { role: "user" as const, content: trimmed },
          { role: "assistant" as const, content: response.reply },
        ].slice(-8),
      );
      setMessage("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo consultar el asistente.",
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    message,
    setMessage,
    result,
    error,
    loading,
    submit,
  };
}
