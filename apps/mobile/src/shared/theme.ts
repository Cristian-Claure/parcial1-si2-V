import { StyleSheet } from "react-native";

export const colors = {
  ivory: "#F8F4EF",
  surface: "#F4F0EA",
  surfaceSoft: "#EFE7DF",
  card: "#FFFDFA",
  cardMuted: "#EAE1D8",
  ink: "#201D1B",
  inkSoft: "#403A36",
  muted: "#786E68",
  mutedLight: "#9B8F87",
  champagne: "#C7A989",
  terracotta: "#A97760",
  dustyRose: "#C79A98",
  roseGold: "#B98273",
  success: "#66825F",
  warning: "#A47A3E",
  error: "#A05F59",
  info: "#6E7887",
  border: "rgba(32,29,27,0.12)",
  borderStrong: "rgba(32,29,27,0.22)",
} as const;

export const commonStyles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    gap: 16,
  },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 3,
    color: colors.ink,
  },
  brandTag: {
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    marginTop: 2,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.terracotta,
  },
  heading: {
    fontSize: 32,
    lineHeight: 38,
    fontFamily: "serif",
    color: colors.ink,
  },
  subheading: {
    fontSize: 21,
    lineHeight: 27,
    fontFamily: "serif",
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  muted: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 15,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  buttonText: {
    color: colors.ivory,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  buttonSecondary: {
    backgroundColor: colors.cardMuted,
  },
  buttonSecondaryText: {
    color: colors.ink,
  },
  buttonDanger: {
    backgroundColor: colors.error,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipText: {
    fontSize: 12,
    color: colors.ink,
  },
  chipTextActive: {
    color: colors.ivory,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});