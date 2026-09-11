import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "./AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}